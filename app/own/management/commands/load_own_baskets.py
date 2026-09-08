import json
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction

from own.models import OwnBasket


class Command(BaseCommand):
    help = 'Seed OWN baskets from a JSON array of {"id": 117, "name": "Bandeira"} objects.'

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=Path,
            default=settings.BASE_DIR / "load_own_baskets.json",
            help="JSON file containing basket id and name values.",
        )

    def handle(self, *args, **options):
        """Validate and upsert baskets atomically, retaining other baskets."""
        path = Path(options["file"])
        try:
            with path.open(encoding="utf-8-sig") as source:
                records = json.load(source)
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise CommandError(f"Could not read {path}: {exc}") from exc

        if not isinstance(records, list):
            raise CommandError("Expected a JSON array of basket objects.")

        baskets = []
        seen_ids = set()
        seen_names = set()
        for index, record in enumerate(records, start=1):
            if (
                not isinstance(record, dict)
                or type(record.get("id")) is not int
                or not isinstance(record.get("name"), str)
            ):
                raise CommandError(
                    f"Basket {index} must have an integer id and a string name."
                )
            basket = OwnBasket(id=record["id"], name=record["name"])
            if basket.id in seen_ids or basket.name in seen_names:
                raise CommandError(f"Basket {index} has a duplicate id or name.")
            try:
                basket.clean_fields()
            except ValidationError as exc:
                raise CommandError(f"Invalid basket {index}: {exc}") from exc
            seen_ids.add(basket.id)
            seen_names.add(basket.name)
            baskets.append(basket)

        created_count = 0
        try:
            with transaction.atomic():
                for basket in baskets:
                    instance = OwnBasket.objects.filter(pk=basket.id).first()
                    if instance is None:
                        instance = OwnBasket(id=basket.id)
                        created_count += 1
                    instance.name = basket.name
                    instance.full_clean()
                    instance.save()
        except (ValidationError, IntegrityError) as exc:
            raise CommandError(f"Could not load OWN baskets: {exc}") from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Loaded {len(baskets)} OWN baskets from {path} "
                f"({created_count} created, {len(baskets) - created_count} updated)."
            )
        )
