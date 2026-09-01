import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from own.models import OwnActivity


def extract_records(payload):
    if isinstance(payload, list) and all(isinstance(item, dict) for item in payload):
        return payload
    if isinstance(payload, dict):
        if {"codCnae", "descCnae", "codMcc"}.issubset(payload):
            return [payload]
        for value in payload.values():
            try:
                return extract_records(value)
            except CommandError:
                continue
    raise CommandError("Could not find the consultarAtividades records in the JSON payload.")


def transform_record(record):
    try:
        return {
            "cnae": str(record["codCnae"]),
            "description": str(record["descCnae"]),
            "mcc": int(record["codMcc"]),
        }
    except (KeyError, TypeError, ValueError) as exc:
        raise CommandError(f"Invalid consultarAtividades record: {record!r}.") from exc


def transform_unique_records(records):
    activities = []
    seen_cnaes = set()
    for record in records:
        activity = transform_record(record)
        if activity["cnae"] in seen_cnaes:
            continue
        seen_cnaes.add(activity["cnae"])
        activities.append(activity)
    return activities


class Command(BaseCommand):
    help = "Destructively replace OWN activities from load_consultar_atividades.json."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=Path,
            default=settings.BASE_DIR / "load_consultar_atividades.json",
            help="Path to the consultarAtividades JSON response.",
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

        activities = transform_unique_records(extract_records(payload))

        with transaction.atomic():
            OwnActivity.objects.all().delete()
            OwnActivity.objects.bulk_create(
                OwnActivity(**activity) for activity in activities
            )

        self.stdout.write(
            self.style.SUCCESS(f"Loaded {len(activities)} OWN activities from {path}.")
        )
