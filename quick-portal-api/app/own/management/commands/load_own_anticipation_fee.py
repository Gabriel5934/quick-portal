from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from own.models import OwnBasket, OwnFee, OwnMethod


ANTICIPATION_FEES = ((-117, 117, "Bandeira"), (-333, 333, "Parcela"))


class Command(BaseCommand):
    help = "Create or update the two OWN anticipation fees."

    def add_arguments(self, parser):
        parser.add_argument("base_mdr", help="Base MDR percentage for both fees.")

    def handle(self, *args, **options):
        try:
            base_mdr = Decimal(options["base_mdr"])
        except (InvalidOperation, TypeError) as exc:
            raise CommandError("base_mdr must be a number.") from exc

        with transaction.atomic():
            for fee_id, basket_id, basket_name in ANTICIPATION_FEES:
                basket, _ = OwnBasket.objects.update_or_create(
                    id=basket_id, defaults={"name": basket_name}
                )
                OwnFee.objects.update_or_create(
                    id=fee_id,
                    defaults={
                        "basketId": basket,
                        "value": Decimal("0.0"),
                        "baseMdr": base_mdr,
                        "network": None,
                        "channel": None,
                        "method": OwnMethod.ANTICIPATION,
                        "installment": None,
                        "upperInstallment": None,
                    },
                )

        self.stdout.write(self.style.SUCCESS("Loaded 2 OWN anticipation fees."))
