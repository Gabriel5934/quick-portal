import json
import re
import unicodedata
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from own.models import OwnBasket, OwnFee


def normalize(value):
    """Return an uppercase ASCII representation suitable for product parsing."""
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(
        character for character in value if not unicodedata.combining(character)
    )
    return re.sub(r"[^A-Z0-9]+", " ", value.upper()).strip()


def extract_records(payload):
    """Return the consultarCesta records found within ``payload``."""
    if isinstance(payload, list) and all(isinstance(item, dict) for item in payload):
        return payload
    if isinstance(payload, dict):
        if {"cestaId", "cestaValorId", "produto", "nomeCesta"}.issubset(payload):
            return [payload]
        for value in payload.values():
            try:
                return extract_records(value)
            except CommandError:
                continue
    raise CommandError("Could not find the consultarCesta records in the JSON payload.")


def extract_baskets(records):
    """Return unique basket IDs and names discovered in source ``records``."""
    baskets = {}
    names = {}
    for index, record in enumerate(records, start=1):
        try:
            basket_id = record["cestaId"]
            name = record["nomeCesta"]
        except (KeyError, TypeError) as exc:
            raise CommandError(
                f"Record {index} must include cestaId and nomeCesta."
            ) from exc
        if type(basket_id) is not int or not isinstance(name, str) or not name.strip():
            raise CommandError(
                f"Record {index} must have an integer cestaId and non-empty nomeCesta."
            )
        name = name.strip()
        if len(name) > 255:
            raise CommandError(f"Basket {basket_id} has a name longer than 255 characters.")
        previous_name = baskets.setdefault(basket_id, name)
        if previous_name != name:
            raise CommandError(f"Basket {basket_id} has conflicting nomeCesta values.")
        previous_id = names.setdefault(name, basket_id)
        if previous_id != basket_id:
            raise CommandError(f"Basket name {name!r} belongs to multiple cestaId values.")
    if not baskets:
        raise CommandError("The consultarCesta payload does not contain any baskets.")
    return baskets


def parse_network(product):
    """Return the OWN network name parsed from normalized ``product`` text."""
    if re.search(r"\bVISA\b", product):
        return "Visa"
    if re.search(r"\bELO\b", product):
        return "Elo"
    if re.search(r"\bMASTER(?:\s*CARD)?\b", product):
        return "Mastercard"
    return None


def parse_method(product):
    """Return the payment method parsed from normalized ``product`` text."""
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
    """Return the lower and optional upper installment values for a product."""
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


def decimal_field(record, field):
    """Return ``field`` from ``record`` as a finite decimal value."""
    try:
        value = Decimal(str(record[field]))
    except (KeyError, TypeError, ValueError, InvalidOperation) as exc:
        raise CommandError(f"Invalid {field!r} in record {record!r}.") from exc
    if not value.is_finite():
        raise CommandError(f"Invalid {field!r} in record {record!r}.")
    return value


def transform_record(record):
    """Transform one raw consultarCesta record into OWN fee attributes."""
    try:
        basket_id = record["cestaId"]
        fee_id = record["cestaValorId"]
        raw_product = record["produto"]
    except (KeyError, TypeError) as exc:
        raise CommandError(f"Invalid consultarCesta record: {record!r}.") from exc
    if type(basket_id) is not int or type(fee_id) is not int or not isinstance(raw_product, str):
        raise CommandError(f"Invalid consultarCesta record: {record!r}.")
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
        "value": decimal_field(record, "valor"),
        "baseMdr": decimal_field(record, "valorMinimo"),
        "network": network,
        "channel": (
            "Ecommerce"
            if re.search(
                r"\bE\s*COMMERCE\b|\bECOMMERCE\b|\bONLINE\b|\bDIGITAL\b",
                product,
            )
            else "Physical"
        ),
        "method": method,
        "installment": installment,
        "upperInstallment": upper_installment,
    }


def validate_fees(fees, basket_ids):
    """Validate imported fee IDs and their references to discovered baskets."""
    if not fees:
        raise CommandError("The consultarCesta payload does not contain any fees.")
    fee_ids = [fee["id"] for fee in fees]
    if len(set(fee_ids)) != len(fee_ids):
        raise CommandError("Invalid consultarCesta data: cestaValorId values are not unique.")
    unknown_baskets = {fee["basketId"] for fee in fees}.difference(basket_ids)
    if unknown_baskets:
        raise CommandError(
            "Invalid consultarCesta data: fees reference unknown baskets "
            f"{sorted(unknown_baskets)}."
        )


def parse_anticipation_fee(value, basket_id):
    """Parse a non-negative anticipation fee entered for one basket."""
    try:
        fee = Decimal(value)
    except (InvalidOperation, TypeError) as exc:
        raise CommandError(f"Anticipation fee for basket {basket_id} must be a number.") from exc
    if not fee.is_finite() or fee < 0:
        raise CommandError(
            f"Anticipation fee for basket {basket_id} must be a non-negative number."
        )
    return fee


class Command(BaseCommand):
    help = "Synchronize OWN baskets and fees from consultarCesta JSON data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=Path,
            default=settings.BASE_DIR / "load_consultar_cesta.json",
            help="Path to the consultarCesta JSON response.",
        )
        parser.add_argument(
            "--anticipation-fee",
            action="append",
            default=[],
            metavar="CESTA_ID=VALUE",
            help="Set a basket anticipation fee without being prompted; repeat as needed.",
        )

    def anticipation_fees(self, baskets, provided):
        """Collect one anticipation fee for each discovered basket."""
        values = {}
        for item in provided:
            basket_id, separator, value = item.partition("=")
            if not separator:
                raise CommandError("--anticipation-fee must use CESTA_ID=VALUE.")
            try:
                basket_id = int(basket_id)
            except ValueError as exc:
                raise CommandError("--anticipation-fee cesta IDs must be integers.") from exc
            if basket_id in values:
                raise CommandError(f"Anticipation fee for basket {basket_id} was supplied twice.")
            values[basket_id] = parse_anticipation_fee(value, basket_id)
        unknown_baskets = set(values).difference(baskets)
        if unknown_baskets:
            raise CommandError(
                "Anticipation fees were supplied for unknown baskets "
                f"{sorted(unknown_baskets)}."
            )
        for basket_id, name in sorted(baskets.items()):
            if basket_id not in values:
                value = input(f"Anticipation fee for basket {basket_id} ({name}): ")
                values[basket_id] = parse_anticipation_fee(value, basket_id)
        return values

    def handle(self, *args, **options):
        path = options["file"]
        try:
            with path.open(encoding="utf-8-sig") as source:
                payload = json.load(source)
        except FileNotFoundError as exc:
            raise CommandError(f"File not found: {path}") from exc
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise CommandError(f"Could not read {path}: {exc}") from exc

        records = extract_records(payload)
        baskets = extract_baskets(records)
        fees = [transform_record(record) for record in records]
        validate_fees(fees, baskets)
        anticipation_fees = self.anticipation_fees(
            baskets,
            options["anticipation_fee"],
        )
        fee_amounts = {
            basket_id: sum(fee["basketId"] == basket_id for fee in fees)
            for basket_id in baskets
        }

        with transaction.atomic():
            basket_models = {}
            for basket_id, name in baskets.items():
                basket_models[basket_id], _ = OwnBasket.objects.update_or_create(
                    id=basket_id,
                    defaults={
                        "name": name,
                        "anticipation_fee": anticipation_fees[basket_id],
                        "fee_amount": fee_amounts[basket_id],
                    },
                )
            incoming_fee_ids = []
            for fee in fees:
                fee_id = fee["id"]
                incoming_fee_ids.append(fee_id)
                instance = OwnFee.objects.filter(id=fee_id).first()
                if instance is None:
                    instance = OwnFee(id=fee_id)
                for field, value in fee.items():
                    if field != "id":
                        setattr(
                            instance,
                            field,
                            basket_models[value] if field == "basketId" else value,
                        )
                instance.full_clean()
                instance.save()
            OwnFee.objects.exclude(id__in=incoming_fee_ids).filter(
                plan_fees__isnull=True
            ).delete()
            OwnBasket.objects.exclude(id__in=baskets).filter(
                fees__isnull=True,
                plans__isnull=True,
            ).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Loaded {len(baskets)} OWN baskets and {len(fees)} OWN fees from {path}."
            )
        )
