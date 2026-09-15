import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from own.models import OwnActivity


def extract_records(payload):
    """Return activity dictionaries found recursively in JSON ``payload``.

    A non-empty list of dictionaries or a single activity mapping is accepted.
    Nested mapping values are searched recursively. ``CommandError`` is raised
    when no valid record collection can be found.
    """
    if (
        isinstance(payload, list)
        and payload
        and all(isinstance(item, dict) for item in payload)
    ):
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
            "cnae": int(str(record["codCnae"]).translate(str.maketrans("", "", "./-"))),
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
    help = "Refresh OWN activities from load_consultar_atividades.json."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=Path,
            default=settings.BASE_DIR / "load_consultar_atividades.json",
            help="Path to the consultarAtividades JSON response.",
        )

    def handle(self, *args, **options):
        """Validate the selected JSON file and refresh OWN activity records.

        ``options['file']`` identifies the source file. Incoming activities are
        validated and upserted; stale unreferenced rows are removed. A success
        message is written and ``None`` returned. File, JSON, and record errors
        raise ``CommandError`` without deleting existing data.
        """
        path = options["file"]
        try:
            with path.open(encoding="utf-8-sig") as source:
                payload = json.load(source)
        except FileNotFoundError as exc:
            raise CommandError(f"File not found: {path}") from exc
        except (OSError, json.JSONDecodeError) as exc:
            raise CommandError(f"Could not read {path}: {exc}") from exc

        activities = transform_unique_records(extract_records(payload))
        incoming_cnaes = {activity["cnae"] for activity in activities}

        with transaction.atomic():
            for activity in activities:
                values = activity.copy()
                cnae = values.pop("cnae")
                instance = OwnActivity.objects.filter(cnae=cnae).first()
                if instance is None:
                    instance = OwnActivity(cnae=cnae)
                for field, value in values.items():
                    setattr(instance, field, value)
                instance.full_clean()
                instance.save()
            OwnActivity.objects.filter(
                plans__isnull=True,
            ).exclude(
                cnae__in=incoming_cnaes
            ).delete()

        self.stdout.write(
            self.style.SUCCESS(f"Loaded {len(activities)} OWN activities from {path}.")
        )
