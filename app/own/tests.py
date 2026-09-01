import json
from decimal import Decimal
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.management import call_command, CommandError
from django.test import TestCase
from rest_framework.test import APIClient

from own.management.commands.load_own_fees import transform_record, validate_fees
from own.models import (
    OwnActivity,
    OwnBasket,
    OwnChannel,
    OwnFee,
    OwnMethod,
    OwnNetwork,
    OwnPlan,
    OwnPlanFee,
)


class OwnFeeTransformTests(TestCase):
    def test_parses_inconsistent_product_text(self):
        """Use ``self`` to verify inconsistent text normalization; return ``None``."""
        fee = transform_record({
            "cestaId": 333,
            "cestaValorId": 297116,
            "produto": "Crédito Parcelado 02x - 06X master card e_commerce",
            "valor": 3.3,
            "valorMinimo": 3.3,
        })

        self.assertEqual(fee["basketId"], 333)
        self.assertEqual(fee["network"], "Mastercard")
        self.assertEqual(fee["channel"], "Ecommerce")
        self.assertEqual(fee["method"], "Installments")
        self.assertEqual((fee["installment"], fee["upperInstallment"]), (2, 6))
        self.assertIsInstance(fee["value"], float)
        self.assertIsInstance(fee["baseMdr"], float)

    def test_defaults_to_physical_and_allows_no_network(self):
        """Use ``self`` to verify physical products may omit a network; return ``None``."""
        fee = transform_record({
            "cestaId": 117,
            "cestaValorId": 1,
            "produto": "ALUGUEL DE POS",
            "valor": 1,
            "valorMinimo": 1,
        })

        self.assertIsNone(fee["network"])
        self.assertEqual(fee["channel"], "Physical")
        self.assertEqual(fee["method"], "POS Rent")

    def test_abbreviated_credit_range_without_x_is_installments(self):
        """Use ``self`` to verify abbreviated ranges parse correctly; return ``None``."""
        fee = transform_record({
            "cestaId": 117,
            "cestaValorId": 2,
            "produto": "CRED PARC 13 A 18 VISA E COMMERCE",
            "valor": 4.2,
            "valorMinimo": 4.0,
        })

        self.assertEqual(fee["method"], "Installments")
        self.assertEqual((fee["installment"], fee["upperInstallment"]), (13, 18))
        self.assertEqual(fee["network"], "Visa")
        self.assertEqual(fee["channel"], "Ecommerce")

    def test_credit_with_an_installment_number_takes_precedence(self):
        """Use ``self`` to verify numbered credit selects installments; return ``None``."""
        for product in ("CRED 9 ELO", "CREDITO 9 ELO"):
            with self.subTest(product=product):
                fee = transform_record({
                    "cestaId": 333,
                    "cestaValorId": 3,
                    "produto": product,
                    "valor": 3,
                    "valorMinimo": 3,
                })

                self.assertEqual(fee["method"], "Installments")
                self.assertEqual(fee["installment"], 9)
                self.assertIsNone(fee["upperInstallment"])

    def test_visa_voucher_is_not_tied_to_the_visa_network(self):
        """Use ``self`` to verify Visa Voucher has no Visa network; return ``None``."""
        fee = transform_record({
            "cestaId": 117,
            "cestaValorId": 4,
            "produto": "VISA VOUCHER",
            "valor": 1,
            "valorMinimo": 1,
        })

        self.assertEqual(fee["method"], "Visa Voucher")
        self.assertIsNone(fee["network"])


class OwnFeeCommandTests(TestCase):
    def test_invalid_file_does_not_delete_existing_fees(self):
        network = OwnNetwork.objects.get(name="Visa")
        channel = OwnChannel.objects.get(name="Physical")
        method = OwnMethod.objects.get(name="Credit")
        OwnFee.objects.create(
            id=99, basketId=OwnBasket.objects.get(pk=117), value=1, baseMdr=1,
            network=network, channel=channel, method=method,
        )
        with TemporaryDirectory() as directory:
            path = Path(directory) / "fees.json"
            path.write_text(json.dumps([]))
            with self.assertRaises(CommandError):
                call_command("load_own_fees", file=path, stdout=StringIO())

        self.assertTrue(OwnFee.objects.filter(pk=99).exists())

    def test_validation_accepts_required_distribution(self):
        fees = []
        fee_id = 1
        for basket_id, counts in {
            117: {None: 5, "Visa": 12, "Elo": 12, "Mastercard": 12},
            333: {None: 2, "Visa": 46, "Elo": 46, "Mastercard": 46},
        }.items():
            for network, count in counts.items():
                for _ in range(count):
                    fees.append({"id": fee_id, "basketId": basket_id, "network": network})
                    fee_id += 1
        validate_fees(fees)

    def test_reload_preserves_referenced_obsolete_fees(self):
        """Use ``self`` to verify referenced obsolete fees survive; return ``None``."""
        user = User.objects.create_user("fee-owner")
        activity = OwnActivity.objects.create(
            cnae="5829-8/00", description="Activity", mcc=2741
        )
        basket = OwnBasket.objects.get(pk=117)
        method = OwnMethod.objects.get(name="Credit")
        referenced = OwnFee.objects.create(
            id=90, basketId=basket, value=1, baseMdr=1, method=method
        )
        OwnFee.objects.create(
            id=91, basketId=basket, value=1, baseMdr=1, method=method
        )
        plan = OwnPlan.objects.create(
            created_by=user,
            updated_by=user,
            title="Plan",
            activity=activity,
            basketId=basket,
        )
        OwnPlanFee.objects.create(plan=plan, fee=referenced, value=1)
        payload = [{
            "cestaId": 117,
            "cestaValorId": 92,
            "produto": "CREDITO VISA",
            "valor": 2,
            "valorMinimo": 1,
        }]
        with TemporaryDirectory() as directory:
            path = Path(directory) / "fees.json"
            path.write_text(json.dumps(payload))
            with patch("own.management.commands.load_own_fees.validate_fees"):
                call_command("load_own_fees", file=path, stdout=StringIO())

        self.assertTrue(OwnFee.objects.filter(pk=90).exists())
        self.assertFalse(OwnFee.objects.filter(pk=91).exists())
        self.assertTrue(OwnFee.objects.filter(pk=92).exists())


class OwnFeeEndpointTests(TestCase):
    def test_endpoint_requires_authentication_and_returns_all_fees(self):
        network = OwnNetwork.objects.get(name="Elo")
        channel = OwnChannel.objects.get(name="Ecommerce")
        method = OwnMethod.objects.get(name="Debit")
        OwnFee.objects.create(
            id=10, basketId=OwnBasket.objects.get(pk=117), value=2.5, baseMdr=2,
            network=network, channel=channel, method=method,
        )
        client = APIClient()
        self.assertEqual(client.get("/own/fees/").status_code, 401)
        client.force_authenticate(User.objects.create_user("own-user"))

        response = client.get("/own/fees/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["network"]["name"], "Elo")
        self.assertEqual(response.data[0]["value"], "2.5000000000")
        self.assertEqual(response.data[0]["baseMdr"], "2.0000000000")


class OwnActivityCommandTests(TestCase):
    def test_command_destructively_loads_activities(self):
        """Use ``self`` to verify destructive activity loading; return ``None``."""
        OwnActivity.objects.create(cnae="old", description="Old", mcc=1)
        payload = [{
            "codCnae": "5829-8/00",
            "descCnae": "EDIÇÃO INTEGRADA",
            "codMcc": 2741,
        }]
        with TemporaryDirectory() as directory:
            path = Path(directory) / "activities.json"
            path.write_text(json.dumps(payload))
            call_command("load_own_activities", file=path, stdout=StringIO())

        self.assertFalse(OwnActivity.objects.filter(pk="old").exists())
        activity = OwnActivity.objects.get()
        self.assertEqual(activity.cnae, "5829-8/00")
        self.assertEqual(activity.description, "EDIÇÃO INTEGRADA")
        self.assertEqual(activity.mcc, 2741)

    def test_command_keeps_first_duplicate_cnae(self):
        """Use ``self`` to verify the first duplicate CNAE wins; return ``None``."""
        payload = [
            {
                "codCnae": "4530-7/01",
                "descCnae": "FIRST DESCRIPTION",
                "codMcc": 5300,
            },
            {
                "codCnae": "4530-7/01",
                "descCnae": "SECOND DESCRIPTION",
                "codMcc": 9999,
            },
        ]
        with TemporaryDirectory() as directory:
            path = Path(directory) / "activities.json"
            path.write_text(json.dumps(payload))
            call_command("load_own_activities", file=path, stdout=StringIO())

        activity = OwnActivity.objects.get()
        self.assertEqual(activity.description, "FIRST DESCRIPTION")
        self.assertEqual(activity.mcc, 5300)


class OwnAnticipationFeeCommandTests(TestCase):
    def test_command_creates_and_updates_both_fees(self):
        """Use ``self`` to verify both anticipation fees upsert; return ``None``."""
        call_command("load_own_anticipation_fee", "1.25", stdout=StringIO())
        fees = OwnFee.objects.filter(method__name="Anticipation").order_by("basketId")
        self.assertEqual(list(fees.values_list("basketId", flat=True)), [117, 333])
        self.assertTrue(all(fee.baseMdr == Decimal("1.25") for fee in fees))
        self.assertTrue(all(fee.value == Decimal("0.0") for fee in fees))
        self.assertTrue(all(fee.network is None and fee.channel is None for fee in fees))

        call_command("load_own_anticipation_fee", "2.5", stdout=StringIO())
        self.assertEqual(OwnFee.objects.filter(method__name="Anticipation").count(), 2)
        self.assertTrue(all(
            fee.baseMdr == Decimal("2.5")
            for fee in OwnFee.objects.filter(method__name="Anticipation")
        ))


class OwnPlanEndpointTests(TestCase):
    def setUp(self):
        """Use ``self`` to create plan endpoint fixtures; return ``None``."""
        self.user = User.objects.create_user("plan-user")
        self.other_user = User.objects.create_user("plan-editor")
        self.activity = OwnActivity.objects.create(
            cnae="5829-8/00", description="Activity", mcc=2741
        )
        self.fee = OwnFee.objects.create(
            id=900, basketId=OwnBasket.objects.get(pk=117), value=0, baseMdr=1,
            method=OwnMethod.objects.get(name="Credit"),
        )
        self.client = APIClient()

    def test_crud_tracks_users_and_replaces_nested_fees(self):
        """Use ``self`` to verify audited plan CRUD and fee replacement; return ``None``."""
        self.assertEqual(self.client.get("/own/plans/").status_code, 401)
        self.client.force_authenticate(self.user)
        response = self.client.post("/own/plans/", {
            "title": "Standard",
            "description": "A plan",
            "anticipation_type": "Rotating",
            "activity": self.activity.pk,
            "basketId": 117,
            "fees": [{"fee": self.fee.pk, "value": "1.5000000000"}],
        }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        plan = OwnPlan.objects.get()
        self.assertEqual(plan.created_by, self.user)
        self.assertEqual(plan.updated_by, self.user)
        self.assertEqual(plan.basketId_id, 117)
        self.assertEqual(plan.fees.get().fee, self.fee)

        self.client.force_authenticate(self.other_user)
        response = self.client.patch(
            f"/own/plans/{plan.pk}/",
            {"title": "Updated", "fees": []},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        plan.refresh_from_db()
        self.assertEqual(plan.updated_by, self.other_user)
        self.assertFalse(plan.fees.exists())

        self.assertEqual(self.client.delete(f"/own/plans/{plan.pk}/").status_code, 204)

    def test_direct_model_save_validates_anticipation_type(self):
        """Use ``self`` to verify direct saves reject invalid choices; return ``None``."""
        plan = OwnPlan(
            created_by=self.user,
            updated_by=self.user,
            title="Invalid plan",
            anticipation_type="Invalid",
            activity=self.activity,
            basketId=OwnBasket.objects.get(pk=117),
        )

        with self.assertRaises(ValidationError):
            plan.save()
