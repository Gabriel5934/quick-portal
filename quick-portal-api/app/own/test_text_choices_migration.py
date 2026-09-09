from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class OwnTextChoicesMigrationTests(TransactionTestCase):
    migrate_from = [("own", "0007_alter_ownbusiness_registration_status_and_more")]
    migrate_to = [("own", "0008_own_fee_text_choices")]

    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def test_fee_values_and_nulls_survive_migration_and_rollback(self):
        try:
            old_apps = self.migrate(self.migrate_from)
            Basket = old_apps.get_model("own", "OwnBasket")
            Fee = old_apps.get_model("own", "OwnFee")
            basket = Basket.objects.create(id=991, name="Migration basket")
            references = {}
            for field, name in (
                ("network", "Visa"), ("channel", "Physical"), ("method", "Credit")
            ):
                Reference = old_apps.get_model("own", f"Own{field.title()}")
                references[field] = Reference.objects.get(name=name)
            Fee.objects.create(
                id=991, basketId=basket, value="1.25", baseMdr="0.75", **references
            )
            Fee.objects.create(
                id=992, basketId=basket, value=0, baseMdr=1,
                method=old_apps.get_model("own", "OwnMethod").objects.get(
                    name="Anticipation"
                ),
            )

            new_apps = self.migrate(self.migrate_to)
            migrated = new_apps.get_model("own", "OwnFee")
            credit = migrated.objects.get(pk=991)
            self.assertEqual((credit.network, credit.channel, credit.method),
                             ("Visa", "Physical", "Credit"))
            anticipation = migrated.objects.get(pk=992)
            self.assertIsNone(anticipation.network)
            self.assertIsNone(anticipation.channel)
            self.assertEqual(anticipation.method, "Anticipation")
            self.assertEqual(str(credit.value), "1.2500000000")

            old_apps = self.migrate(self.migrate_from)
            restored = old_apps.get_model("own", "OwnFee").objects.get(pk=991)
            self.assertEqual(restored.network.name, "Visa")
            self.assertEqual(restored.channel.name, "Physical")
            self.assertEqual(restored.method.name, "Credit")
        finally:
            self.migrate(self.migrate_to)
