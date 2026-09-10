import random

from django.core.management.base import BaseCommand
from django.db import transaction

from quickportal.management.business_factory import create_business
from quickportal.models import BusinessType


ROOT_TYPES = {"reseller": BusinessType.RESELLER, "store": BusinessType.STORE}


class Command(BaseCommand):
    help = "Create a root reseller or root store with realistic randomized data"

    def add_arguments(self, parser):
        parser.add_argument("type", choices=ROOT_TYPES, help="Type of root business to create")
        parser.add_argument("--seed", type=int, help="Seed the random generator")

    @transaction.atomic
    def handle(self, *args, **options):
        business = create_business(random.Random(options["seed"]), ROOT_TYPES[options["type"]])
        self.stdout.write(self.style.SUCCESS(f"Created root {business.get_type_display()} #{business.id}: {business.name}"))
