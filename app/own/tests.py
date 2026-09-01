import json
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.auth.models import User
from django.core.management import call_command, CommandError
from django.test import TestCase
from rest_framework.test import APIClient

from own.management.commands.load_own_fees import transform_record, validate_fees
from own.models import OwnChannel, OwnFee, OwnMethod, OwnNetwork


class OwnFeeTransformTests(TestCase):
    def test_parses_inconsistent_product_text(self):
        fee = transform_record({
            "cestaId": 333,
            "cestaValorId": 297116,
            "produto": "Crédito Parcelado 02x - 06X master card e_commerce",
            "valor": 3.3,
            "valorMinimo": 3.3,
        })

        self.assertEqual(fee["basketName"], "Parcela")
        self.assertEqual(fee["network"], "Mastercard")
        self.assertEqual(fee["channel"], "Ecommerce")
        self.assertEqual(fee["method"], "Installments")
        self.assertEqual((fee["installment"], fee["upperInstallment"]), (2, 6))
        self.assertIsInstance(fee["value"], float)
        self.assertIsInstance(fee["baseMdr"], float)

    def test_defaults_to_physical_and_allows_no_network(self):
        fee = transform_record({
            "cestaId": 177,
            "cestaValorId": 1,
            "produto": "ALUGUEL DE POS",
            "valor": 1,
            "valorMinimo": 1,
        })

        self.assertIsNone(fee["network"])
        self.assertEqual(fee["channel"], "Physical")
        self.assertEqual(fee["method"], "POS Rent")

    def test_abbreviated_credit_range_without_x_is_installments(self):
        fee = transform_record({
            "cestaId": 177,
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
        fee = transform_record({
            "cestaId": 177,
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
            id=99, basketId=177, basketName="Bandeira", value=1, baseMdr=1,
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
        for basket_name, counts in {
            "Bandeira": {None: 5, "Visa": 12, "Elo": 12, "Mastercard": 12},
            "Parcela": {None: 2, "Visa": 46, "Elo": 46, "Mastercard": 46},
        }.items():
            for network, count in counts.items():
                for _ in range(count):
                    fees.append({"id": fee_id, "basketName": basket_name, "network": network})
                    fee_id += 1
        validate_fees(fees)


class OwnFeeEndpointTests(TestCase):
    def test_endpoint_requires_authentication_and_returns_all_fees(self):
        network = OwnNetwork.objects.get(name="Elo")
        channel = OwnChannel.objects.get(name="Ecommerce")
        method = OwnMethod.objects.get(name="Debit")
        OwnFee.objects.create(
            id=10, basketId=177, basketName="Bandeira", value=2.5, baseMdr=2,
            network=network, channel=channel, method=method,
        )
        client = APIClient()
        self.assertEqual(client.get("/own/fees/").status_code, 401)
        client.force_authenticate(User.objects.create_user("own-user"))

        response = client.get("/own/fees/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["network"]["name"], "Elo")
        self.assertIsInstance(response.data[0]["value"], float)
        self.assertIsInstance(response.data[0]["baseMdr"], float)
