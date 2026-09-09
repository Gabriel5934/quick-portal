import json
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from own.models import OwnBasket


class LoadOwnBasketsTests(TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "baskets.json"

    def load(self, records):
        self.path.write_text(json.dumps(records), encoding="utf-8")
        call_command("load_own_baskets", file=self.path, stdout=StringIO())

    def test_upserts_idempotently_and_preserves_other_baskets(self):
        records = [{"id": 117, "name": "Updated"}, {"id": 999, "name": "New"}]
        self.load(records)
        self.load(records)
        self.assertEqual(OwnBasket.objects.get(pk=117).name, "Updated")
        self.assertEqual(OwnBasket.objects.get(pk=999).name, "New")
        self.assertTrue(OwnBasket.objects.filter(pk=333).exists())

    def test_invalid_records_leave_database_unchanged(self):
        for invalid in [
            {"id": True, "name": "Bad"},
            {"id": 998.5, "name": "Bad"},
            {"id": 998, "name": "x" * 21},
            {"id": 998, "name": ""},
            {"id": 998},
            None,
        ]:
            with self.subTest(record=invalid):
                with self.assertRaises(CommandError):
                    self.load([{"id": 999, "name": "New"}, invalid])
                self.assertFalse(OwnBasket.objects.filter(pk=999).exists())

    def test_duplicate_ids_and_names_are_rejected(self):
        for second in [{"id": 999, "name": "Other"}, {"id": 998, "name": "New"}]:
            with self.subTest(record=second), self.assertRaises(CommandError):
                self.load([{"id": 999, "name": "New"}, second])
        self.assertFalse(OwnBasket.objects.filter(pk=999).exists())

    def test_database_name_conflict_rolls_back_earlier_inserts(self):
        with self.assertRaises(CommandError):
            self.load([{"id": 999, "name": "New"}, {"id": 998, "name": "Bandeira"}])
        self.assertFalse(OwnBasket.objects.filter(pk=999).exists())

    def test_missing_file_and_invalid_json_are_reported(self):
        with self.assertRaises(CommandError):
            call_command("load_own_baskets", file=self.path, stdout=StringIO())
        self.path.write_text("{", encoding="utf-8")
        with self.assertRaises(CommandError):
            call_command("load_own_baskets", file=self.path, stdout=StringIO())
        with self.assertRaises(CommandError):
            self.load({"id": 999, "name": "New"})

    def test_default_file_seeds_existing_baskets(self):
        OwnBasket.objects.filter(pk=117).update(name="Old")
        call_command("load_own_baskets", stdout=StringIO())
        self.assertEqual(OwnBasket.objects.get(pk=117).name, "Bandeira")
        self.assertEqual(OwnBasket.objects.get(pk=333).name, "Parcela")
