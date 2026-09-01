import json
import re
import unicodedata
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from own.models import OwnChannel, OwnFee, OwnMethod, OwnNetwork


NETWORK_NAMES = ("Visa", "Elo", "Mastercard")
CHANNEL_NAMES = ("Physical", "Ecommerce")
METHOD_NAMES = (
    "Pix",
    "Debit",
    "Credit",
    "Installments",
    "POS Rent",
    "Top Bank",
    "Visa Voucher",
)
BASKET_NAMES = {117: "Bandeira", 333: "Parcela"}


def normalize(value):
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(
        character for character in value if not unicodedata.combining(character)
    )
    return re.sub(r"[^A-Z0-9]+", " ", value.upper()).strip()


def extract_records(payload):
    if isinstance(payload, list):
        if all(isinstance(item, dict) for item in payload):
            return payload
    if isinstance(payload, dict):
        if {"cestaId", "cestaValorId", "produto"}.issubset(payload):
            return [payload]
        for value in payload.values():
            try:
                return extract_records(value)
            except CommandError:
                continue
    raise CommandError("Could not find the consultarCesta records in the JSON payload.")


def parse_network(product):
    if re.search(r"\bVISA\b", product):
        return "Visa"
    if re.search(r"\bELO\b", product):
        return "Elo"
    if re.search(r"\bMASTER(?:\s*CARD)?\b", product):
        return "Mastercard"
    return None


def parse_method(product):
    if "VOUCHER" in product or "VALE" in product:
        return "Visa Voucher"
    if "TOP BANK" in product or "TOPBANK" in product:
        return "Top Bank"
    if "PIX" in product:
        return "Pix"
    if any(term in product for term in ("ALUGUEL", "RENT", "LOCACAO", "POS")):
        return "POS Rent"
    if "DEBIT" in product:
        return "Debit"
    is_credit = bool(re.search(r"\bCRED(?:IT[O]?)?\b", product))
    has_number = bool(re.search(r"\b\d+\b", product))
    if (
        re.search(r"\d+\s*X", product)
        or re.search(r"\bPARC\w*\b|\bINSTALL\w*\b", product)
        or (is_credit and has_number)
    ):
        return "Installments"
    if is_credit or any(term in product for term in ("A VISTA", "AVISTA")):
        return "Credit"
    raise CommandError(f"Could not determine method from produto={product!r}.")


def parse_installments(product, method):
    if method != "Installments":
        return None, None
    values = [int(value) for value in re.findall(r"\b0*(\d+)\s*X\b", product)]
    if not values:
        values = [int(value) for value in re.findall(r"\b0*(\d+)\b", product)]
    if not values:
        raise CommandError(
            f"Could not determine installments from produto={product!r}."
        )
    return values[0], values[1] if len(values) > 1 else None


def float_field(record, field):
    try:
        return float(record[field])
    except (KeyError, TypeError, ValueError) as exc:
        raise CommandError(f"Invalid {field!r} in record {record!r}.") from exc


def transform_record(record):
    try:
        basket_id = int(record["cestaId"])
        fee_id = int(record["cestaValorId"])
        raw_product = record["produto"]
    except (KeyError, TypeError, ValueError) as exc:
        raise CommandError(f"Invalid consultarCesta record: {record!r}.") from exc
    if basket_id not in BASKET_NAMES:
        raise CommandError(f"Unsupported cestaId={basket_id} in fee {fee_id}.")
    product = normalize(raw_product)
    method = parse_method(product)
    installment, upper_installment = parse_installments(product, method)
    network = (
        None
        if method in {"Pix", "POS Rent", "Top Bank", "Visa Voucher"}
        else parse_network(product)
    )
    return {
        "id": fee_id,
        "basketId": basket_id,
        "basketName": BASKET_NAMES[basket_id],
        "value": float_field(record, "valor"),
        "baseMdr": float_field(record, "valorMinimo"),
        "network": network,
        "channel": (
            "Ecommerce"
            if re.search(
                r"\bE\s*COMMERCE\b|\bECOMMERCE\b|\bONLINE\b|\bDIGITAL\b", product
            )
            else "Physical"
        ),
        "method": method,
        "installment": installment,
        "upperInstallment": upper_installment,
    }


def validate_fees(fees):
    errors = []
    if len(fees) != 181:
        errors.append(f"expected 181 fees, found {len(fees)}")
    if len({fee["id"] for fee in fees}) != len(fees):
        errors.append("cestaValorId values are not unique")
    expected = {
        "Bandeira": {None: 5, "Visa": 12, "Elo": 12, "Mastercard": 12},
        "Parcela": {None: 2, "Visa": 46, "Elo": 46, "Mastercard": 46},
    }
    for basket_name, network_counts in expected.items():
        basket_fees = [fee for fee in fees if fee["basketName"] == basket_name]
        expected_total = sum(network_counts.values())
        if len(basket_fees) != expected_total:
            errors.append(
                f"expected {expected_total} {basket_name} fees, found {len(basket_fees)}"
            )
        for network, expected_count in network_counts.items():
            actual = sum(fee["network"] == network for fee in basket_fees)
            label = network or "no network"
            if actual != expected_count:
                errors.append(
                    f"expected {expected_count} {basket_name}/{label} fees, found {actual}"
                )
    if errors:
        raise CommandError("Invalid consultarCesta data: " + "; ".join(errors))


class Command(BaseCommand):
    help = "Destructively replace OWN fees from /app/load-consultar-cesta.json."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=Path,
            default=settings.BASE_DIR / "load-consultar-cesta.json",
            help="Path to the consultarCesta JSON response.",
        )

    def handle(self, *args, **options):
        path = options["file"]
        try:
            with path.open(encoding="utf-8-sig") as source:
                payload = json.load(source)
        except FileNotFoundError as exc:
            raise CommandError(f"File not found: {path}") from exc
        except (OSError, json.JSONDecodeError) as exc:
            raise CommandError(f"Could not read {path}: {exc}") from exc

        fees = [transform_record(record) for record in extract_records(payload)]
        validate_fees(fees)

        with transaction.atomic():
            networks = {
                name: OwnNetwork.objects.get_or_create(name=name)[0]
                for name in NETWORK_NAMES
            }
            channels = {
                name: OwnChannel.objects.get_or_create(name=name)[0]
                for name in CHANNEL_NAMES
            }
            methods = {
                name: OwnMethod.objects.get_or_create(name=name)[0]
                for name in METHOD_NAMES
            }
            OwnFee.objects.all().delete()
            OwnFee.objects.bulk_create(
                OwnFee(
                    **{
                        **fee,
                        "network": networks.get(fee["network"]),
                        "channel": channels.get(fee["channel"]),
                        "method": methods[fee["method"]],
                    }
                )
                for fee in fees
            )

        self.stdout.write(
            self.style.SUCCESS(f"Loaded {len(fees)} OWN fees from {path}.")
        )
