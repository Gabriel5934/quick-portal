import json
import re
import unicodedata
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from own.models import OwnBasket, OwnChannel, OwnFee, OwnMethod, OwnNetwork


NETWORK_NAMES = ("Visa", "Elo", "Mastercard", "Default")
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
    """Return an uppercase ASCII representation suitable for product parsing.

    ``value`` is any string-compatible source value. The returned string has
    accents and punctuation removed and whitespace normalized.
    """
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(
        character for character in value if not unicodedata.combining(character)
    )
    return re.sub(r"[^A-Z0-9]+", " ", value.upper()).strip()


def extract_records(payload):
    """Return the consultarCesta records found within ``payload``.

    ``payload`` may be the record list, one record, or a nested mapping. A
    ``CommandError`` is raised when no compatible record collection exists.
    """
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
    """Return the OWN network name parsed from normalized ``product`` text.

    Returns ``None`` when the product does not identify a supported network.
    """
    if re.search(r"\bVISA\b", product):
        return "Visa"
    if re.search(r"\bELO\b", product):
        return "Elo"
    if re.search(r"\bMASTER(?:\s*CARD)?\b", product):
        return "Mastercard"
    return None


def parse_method(product):
    """Return the payment method parsed from normalized ``product`` text.

    Raises ``CommandError`` when no supported method can be determined.
    """
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
    """Return the lower and optional upper installment values for a product.

    ``product`` is normalized product text and ``method`` is its parsed method.
    Non-installment methods return ``(None, None)``. A ``CommandError`` is
    raised when an installment product contains no usable installment number.
    """
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
    """Return ``field`` from ``record`` as a float.

    Raises ``CommandError`` when the field is absent or is not numeric.
    """
    try:
        return float(record[field])
    except (KeyError, TypeError, ValueError) as exc:
        raise CommandError(f"Invalid {field!r} in record {record!r}.") from exc


def transform_record(record):
    """Transform one raw consultarCesta ``record`` into OWN fee attributes.

    Returns a dictionary ready for reference-object resolution. ``CommandError``
    is raised for missing values, unsupported baskets, methods, or installments.
    """
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
    """Validate the expected IDs and basket/network distribution in ``fees``.

    The function returns ``None`` when valid and raises ``CommandError`` with
    all detected distribution problems otherwise.
    """
    errors = []
    if len(fees) != 181:
        errors.append(f"expected 181 fees, found {len(fees)}")
    if len({fee["id"] for fee in fees}) != len(fees):
        errors.append("cestaValorId values are not unique")
    expected = {
        117: {None: 5, "Visa": 12, "Elo": 12, "Mastercard": 12},
        333: {None: 2, "Visa": 46, "Elo": 46, "Mastercard": 46},
    }
    for basket_id, network_counts in expected.items():
        basket_fees = [fee for fee in fees if fee["basketId"] == basket_id]
        basket_name = BASKET_NAMES[basket_id]
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
    help = (
        "Synchronize OWN fees from /app/load-consultar-cesta.json, retaining "
        "obsolete fees that are referenced by plans."
    )

    def add_arguments(self, parser):
        """Register the optional source-file argument on ``parser``.

        Returns ``None`` after configuring the command-line parser.
        """
        parser.add_argument(
            "--file",
            type=Path,
            default=settings.BASE_DIR / "load-consultar-cesta.json",
            help="Path to the consultarCesta JSON response.",
        )

    def handle(self, *args, **options):
        """Load, validate, and synchronize OWN fees from the selected JSON file.

        ``args`` contains unused positional arguments and ``options`` contains
        the parsed file path. Invalid or unreadable input raises ``CommandError``.
        Existing rows are updated by fee ID; obsolete referenced rows are kept,
        while obsolete unreferenced rows are deleted. Returns ``None``.
        """
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
            baskets = {
                basket_id: OwnBasket.objects.update_or_create(
                    id=basket_id, defaults={"name": basket_name}
                )[0]
                for basket_id, basket_name in BASKET_NAMES.items()
            }
            incoming_ids = []
            for fee in fees:
                fee_id = fee["id"]
                incoming_ids.append(fee_id)
                fee_values = {key: value for key, value in fee.items() if key != "id"}
                OwnFee.objects.update_or_create(
                    id=fee_id,
                    defaults={
                        **fee_values,
                        "basketId": baskets[fee["basketId"]],
                        "network": networks.get(fee["network"]),
                        "channel": channels.get(fee["channel"]),
                        "method": methods[fee["method"]],
                    },
                )
            OwnFee.objects.exclude(id__in=incoming_ids).filter(
                plan_fees__isnull=True
            ).delete()

        self.stdout.write(
            self.style.SUCCESS(f"Loaded {len(fees)} OWN fees from {path}.")
        )
