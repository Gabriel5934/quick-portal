import base64
import json
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.exceptions import ValidationError
from django.core.management import call_command, CommandError
from django.db import IntegrityError, transaction
from django.test import override_settings, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from own.management.commands.load_own_fees import transform_record, validate_fees
from own.models import (
    OwnActivity,
    OwnBasket,
    OwnBusiness,
    OwnBusinessAttachment,
    OwnBusinessAttachmentType,
    OwnBusinessPartner,
    OwnChannel,
    OwnFee,
    OwnMethod,
    OwnNetwork,
    OwnPlan,
    OwnPlanFee,
    OwnPartnerAttachment,
    OwnPartnerAttachmentType,
    OwnRegistrationStatus,
)
from quickportal.models import (
    Business,
    BusinessMembership,
    BusinessRole,
    BusinessType,
    DocumentType,
    Status,
)
from quickportal.services.own_merchant import MerchantRegistrationError


class OwnBusinessModelTests(TestCase):
    def setUp(self):
        """Create a generic business, OWN activity, plan, and fee for each test."""
        self.user = User.objects.create_user("own-business-owner")
        self.business = Business.objects.create(
            type=BusinessType.STORE,
            document_type=DocumentType.CNPJ,
            document="12345678000195",
            name="Example Store Ltda.",
            trade_name="Example Store",
            email="store@example.com",
            phone="12999999999",
        )
        self.activity = OwnActivity.objects.create(
            cnae="4711-3/02",
            description="Retail",
            mcc=5411,
        )
        self.plan = OwnPlan.objects.create(
            created_by=self.user,
            updated_by=self.user,
            title="Retail plan",
            activity=self.activity,
            basketId=OwnBasket.objects.get(pk=117),
        )
        fee = OwnFee.objects.create(
            id=800,
            basketId=OwnBasket.objects.get(pk=117),
            value="1.5",
            baseMdr="1.0",
            method=OwnMethod.CREDIT,
        )
        OwnPlanFee.objects.create(plan=self.plan, fee=fee, value="1.75")

    def create_own_business(self, **overrides):
        """Create and return an OWN business using optional field ``overrides``."""
        values = {
            "business": self.business,
            "cnae": self.activity,
            "plan": self.plan,
            "signatory_name": "Maria Silva",
            "signatory_cpf": "52998224725",
            "signatory_email": "maria@example.com",
            "forecast_revenue": "10000.00",
            "contract_revenue": "8000.00",
            "postal_code": "12244867",
            "street": "Rua Milton Martins",
            "address_number": "100A",
            "neighborhood": "Urbanova",
            "city": "São José dos Campos",
            "state": "SP",
            "pos_quantity": 2,
            "bank_code": "001",
            "bank_branch": "0123",
            "bank_branch_digit": "4",
            "bank_account": "00123456",
            "bank_account_digit": "7",
        }
        values.update(overrides)
        return OwnBusiness.objects.create(**values)

    def test_creates_one_own_business_for_a_generic_business(self):
        """Verify one-to-one signup creation and duplicate rejection; return ``None``."""
        own_business = self.create_own_business()

        self.assertEqual(self.business.own_business, own_business)
        self.assertEqual(own_business.cnae, self.activity)
        self.assertEqual(own_business.plan, self.plan)
        with self.assertRaises(ValidationError):
            self.create_own_business()

    def test_rejects_a_plan_for_a_different_activity(self):
        other_activity = OwnActivity.objects.create(
            cnae="6201-5/01",
            description="Software development",
            mcc=7372,
        )
        other_plan = OwnPlan.objects.create(
            created_by=self.user,
            updated_by=self.user,
            title="Software plan",
            activity=other_activity,
            basketId=OwnBasket.objects.get(pk=117),
        )

        with self.assertRaisesMessage(
            ValidationError,
            "The plan activity must match the business CNAE.",
        ):
            self.create_own_business(plan=other_plan)

    def test_full_clean_reports_an_invalid_plan_id(self):
        own_business = self.create_own_business()
        own_business.plan_id = 999999

        with self.assertRaises(ValidationError) as error:
            own_business.full_clean()

        self.assertIn("plan", error.exception.message_dict)

    def test_partner_save_validates_duplicate_cpf(self):
        """Verify normal saves reject a repeated partner CPF; return ``None``."""
        own_business = self.create_own_business()
        OwnBusinessPartner.objects.create(
            own_business=own_business,
            cpf="11144477735",
        )

        with self.assertRaises(ValidationError):
            OwnBusinessPartner.objects.create(
                own_business=own_business,
                cpf="11144477735",
            )

    def test_database_rejects_duplicate_partner_cpf(self):
        """Verify the database rejects bulk-created duplicate CPFs; return ``None``."""
        own_business = self.create_own_business()
        OwnBusinessPartner.objects.create(
            own_business=own_business,
            cpf="11144477735",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            OwnBusinessPartner.objects.bulk_create(
                [
                    OwnBusinessPartner(
                        own_business=own_business,
                        cpf="11144477735",
                    )
                ]
            )

    def test_attachments_use_django_file_storage(self):
        """Verify partner and business documents use file storage; return ``None``."""
        own_business = self.create_own_business()
        partner = OwnBusinessPartner.objects.create(
            own_business=own_business,
            cpf="11144477735",
        )

        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            partner_attachment = OwnPartnerAttachment.objects.create(
                partner=partner,
                file=SimpleUploadedFile("cpf.pdf", b"partner document"),
                original_name="cpf.pdf",
                type=OwnPartnerAttachmentType.CPF,
            )
            business_attachment = OwnBusinessAttachment.objects.create(
                own_business=own_business,
                file=SimpleUploadedFile("contract.pdf", b"contract"),
                original_name="contract.pdf",
                type=OwnBusinessAttachmentType.ARTICLES_OF_ASSOCIATION,
            )

            self.assertTrue(partner_attachment.file.name.startswith("own/partners/"))
            self.assertTrue(
                business_attachment.file.name.startswith("own/businesses/")
            )


class OwnBusinessSignupEndpointTests(TestCase):
    def setUp(self):
        """Create an authenticated manager and signup dependencies for each test."""
        self.user = User.objects.create_user("own-signup-user")
        self.business = Business.objects.create(
            type=BusinessType.STORE,
            document_type=DocumentType.CNPJ,
            document="12345678000195",
            name="Example Store Ltda.",
            trade_name="Example Store",
            email="store@example.com",
            phone="12999999999",
            landline="1233334444",
        )
        BusinessMembership.objects.create(
            user=self.user,
            business=self.business,
            role=BusinessRole.MANAGER,
        )
        self.activity = OwnActivity.objects.create(
            cnae="4711-3/02",
            description="Retail",
            mcc=5411,
        )
        self.plan = OwnPlan.objects.create(
            created_by=self.user,
            updated_by=self.user,
            title="Retail plan",
            activity=self.activity,
            basketId=OwnBasket.objects.get(pk=117),
        )
        fee = OwnFee.objects.create(
            id=801,
            basketId=OwnBasket.objects.get(pk=117),
            value="1.5",
            baseMdr="1.0",
            method=OwnMethod.CREDIT,
        )
        OwnPlanFee.objects.create(plan=self.plan, fee=fee, value="1.75")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def payload(self):
        """Return a complete valid OWN signup request payload."""
        encoded_file = base64.b64encode(b"document contents").decode("ascii")
        return {
            "business": self.business.pk,
            "cnae": self.activity.pk,
            "plan": self.plan.pk,
            "signatory_name": "Maria Silva",
            "signatory_cpf": "52998224725",
            "signatory_email": "maria@example.com",
            "forecast_revenue": "10000.00",
            "contract_revenue": "8000.00",
            "postal_code": "12244867",
            "address_number": "100A",
            "address_complement": "Suite 1",
            "pos_quantity": 2,
            "bank_code": "001",
            "bank_branch": "0123",
            "bank_branch_digit": "4",
            "bank_account": "00123456",
            "bank_account_digit": "7",
            "partners": [
                {
                    "cpf": "11144477735",
                    "attachments": [
                        {"name": "cpf.pdf", "content": encoded_file, "type": "CPF"}
                    ],
                }
            ],
            "attachments": [
                {
                    "name": "contract.pdf",
                    "content": encoded_file,
                    "type": "CONTRATO_SOCIAL",
                }
            ],
        }

    @patch("own.views.register_merchant")
    @patch("own.serializers.fetch_cep_info")
    def test_creates_records_and_sends_derived_own_payload(
        self,
        fetch_cep_info,
        register_merchant,
    ):
        fetch_cep_info.return_value = {
            "street": "Rua Milton Martins",
            "neighborhood": "Urbanova",
            "city": "São José dos Campos",
            "state": "SP",
        }
        register_merchant.return_value = {"protocolo": "PROTO-1", "status": "ok"}

        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            response = self.client.post("/own/businesses/", self.payload(), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        own_business = OwnBusiness.objects.get()
        self.business.refresh_from_db()
        self.assertEqual(own_business.core_protocol, "PROTO-1")
        self.assertEqual(
            own_business.registration_status,
            OwnRegistrationStatus.REGISTERED,
        )
        self.assertEqual(self.business.status, Status.PENDING)
        self.assertEqual(own_business.partners.count(), 1)
        self.assertEqual(own_business.attachments.count(), 1)
        sent_payload = register_merchant.call_args.args[0]
        self.assertEqual(sent_payload["cnpj"], self.business.document)
        self.assertEqual(sent_payload["cnae"], self.activity.pk)
        self.assertEqual(sent_payload["mcc"], self.activity.mcc)
        self.assertEqual(sent_payload["idCesta"], self.plan.basketId_id)
        self.assertEqual(sent_payload["documentosSocios"][0]["identificacao"], "11144477735")
        self.assertEqual(
            sent_payload["documentosSocios"][0]["anexos"][0]["conteudo"],
            base64.b64encode(b"document contents").decode("ascii"),
        )

    @patch("own.views.register_merchant")
    @patch("own.serializers.fetch_cep_info")
    def test_preserves_failed_signup_for_safe_retry_when_own_rejects_it(
        self,
        fetch_cep_info,
        register_merchant,
    ):
        fetch_cep_info.return_value = {
            "street": "Rua Milton Martins",
            "neighborhood": "Urbanova",
            "city": "São José dos Campos",
            "state": "SP",
        }
        register_merchant.side_effect = MerchantRegistrationError(
            "rejected",
            status_code=400,
            response_body="invalid merchant",
        )

        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            response = self.client.post("/own/businesses/", self.payload(), format="json")
            self.assertEqual(
                len([path for path in Path(media_root).rglob("*") if path.is_file()]),
                2,
            )

        self.assertEqual(response.status_code, 400)
        own_business = OwnBusiness.objects.get()
        self.assertEqual(
            own_business.registration_status,
            OwnRegistrationStatus.FAILED,
        )
        self.business.refresh_from_db()
        self.assertEqual(self.business.status, Status.NOT_STARTED)

    def test_requires_authentication(self):
        """Verify unauthenticated signup listing is rejected; return ``None``."""
        self.client.force_authenticate(user=None)
        response = self.client.get("/own/businesses/")
        self.assertEqual(response.status_code, 401)

    def test_malformed_attachment_shapes_return_validation_errors(self):
        """Verify malformed nested file values return HTTP 400; return ``None``."""
        payload = self.payload()
        payload["partners"] = "not-a-list"
        payload["attachments"] = "not-a-list"

        response = self.client.post("/own/businesses/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("partners", response.data)
        self.assertIn("attachments", response.data)

    @patch("own.views.register_merchant")
    @patch("own.serializers.fetch_cep_info")
    def test_unknown_registration_requires_reconciliation_before_retry(
        self,
        fetch_cep_info,
        register_merchant,
    ):
        fetch_cep_info.return_value = {
            "street": "Rua Milton Martins",
            "neighborhood": "Urbanova",
            "city": "São José dos Campos",
            "state": "SP",
        }
        register_merchant.side_effect = MerchantRegistrationError("connection lost")

        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            response = self.client.post("/own/businesses/", self.payload(), format="json")
            own_business = OwnBusiness.objects.get()
            self.assertEqual(response.status_code, 502)
            self.assertEqual(
                own_business.registration_status,
                OwnRegistrationStatus.UNKNOWN,
            )

            retry_response = self.client.post(
                f"/own/businesses/{own_business.pk}/retry/"
            )
            self.assertEqual(retry_response.status_code, 409)

            reconcile_response = self.client.post(
                f"/own/businesses/{own_business.pk}/reconcile/",
                {"registered": False},
                format="json",
            )
            self.assertEqual(reconcile_response.status_code, 200)

            register_merchant.side_effect = None
            register_merchant.return_value = {
                "protocolo": "RETRY-1",
                "status": "ok",
            }
            retry_response = self.client.post(
                f"/own/businesses/{own_business.pk}/retry/"
            )

        self.assertEqual(retry_response.status_code, 200)
        own_business.refresh_from_db()
        self.assertEqual(
            own_business.registration_status,
            OwnRegistrationStatus.REGISTERED,
        )
        self.assertEqual(own_business.core_protocol, "RETRY-1")

    @patch("own.views.register_merchant")
    @patch("own.serializers.fetch_cep_info")
    def test_retries_an_interrupted_pending_registration(
        self,
        fetch_cep_info,
        register_merchant,
    ):
        fetch_cep_info.return_value = {
            "street": "Rua Milton Martins",
            "neighborhood": "Urbanova",
            "city": "São José dos Campos",
            "state": "SP",
        }
        register_merchant.side_effect = MerchantRegistrationError(
            "rejected",
            status_code=400,
        )

        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            self.client.post("/own/businesses/", self.payload(), format="json")
            own_business = OwnBusiness.objects.get()
            OwnBusiness.objects.filter(pk=own_business.pk).update(
                registration_status=OwnRegistrationStatus.PENDING,
                updated_at=timezone.now() - timedelta(minutes=6),
            )
            register_merchant.side_effect = None
            register_merchant.return_value = {"protocolo": "RESUMED-1"}

            response = self.client.post(
                f"/own/businesses/{own_business.pk}/retry/"
            )

        self.assertEqual(response.status_code, 200)
        own_business.refresh_from_db()
        self.assertEqual(
            own_business.registration_status,
            OwnRegistrationStatus.REGISTERED,
        )
        self.assertEqual(own_business.core_protocol, "RESUMED-1")

    @patch("own.serializers.fetch_cep_info")
    def test_rejects_invalid_cpf_check_digits(self, fetch_cep_info):
        payload = self.payload()
        payload["signatory_cpf"] = "11111111111"
        payload["partners"][0]["cpf"] = "12345678901"

        response = self.client.post("/own/businesses/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("signatory_cpf", response.data)
        self.assertIn("partners", response.data)
        fetch_cep_info.assert_not_called()


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
        self.assertIsInstance(fee["value"], Decimal)
        self.assertIsInstance(fee["baseMdr"], Decimal)

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
        network = OwnNetwork.VISA
        channel = OwnChannel.PHYSICAL
        method = OwnMethod.CREDIT
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
        method = OwnMethod.CREDIT
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
        network = OwnNetwork.ELO
        channel = OwnChannel.ECOMMERCE
        method = OwnMethod.DEBIT
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
        self.assertEqual(response.data[0]["network"], "Elo")
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

    def test_command_preserves_stale_activities_referenced_by_plans(self):
        """Verify refresh retains stale activities used by plans; return ``None``."""
        user = User.objects.create_user("activity-plan-owner")
        stale = OwnActivity.objects.create(
            cnae="old",
            description="Referenced activity",
            mcc=1,
        )
        OwnPlan.objects.create(
            created_by=user,
            updated_by=user,
            title="Existing plan",
            activity=stale,
            basketId=OwnBasket.objects.get(pk=117),
        )
        payload = [{"codCnae": "new", "descCnae": "New", "codMcc": 2}]

        with TemporaryDirectory() as directory:
            path = Path(directory) / "activities.json"
            path.write_text(json.dumps(payload))
            call_command("load_own_activities", file=path, stdout=StringIO())

        self.assertTrue(OwnActivity.objects.filter(pk="old").exists())
        self.assertTrue(OwnActivity.objects.filter(pk="new").exists())

    def test_command_rejects_empty_payload_without_deleting_activities(self):
        """Verify empty refresh input preserves current activities; return ``None``."""
        OwnActivity.objects.create(cnae="existing", description="Existing", mcc=1)

        with TemporaryDirectory() as directory:
            path = Path(directory) / "activities.json"
            path.write_text("[]")
            with self.assertRaises(CommandError):
                call_command("load_own_activities", file=path, stdout=StringIO())

        self.assertTrue(OwnActivity.objects.filter(pk="existing").exists())


class OwnAnticipationFeeCommandTests(TestCase):
    def test_command_creates_and_updates_both_fees(self):
        """Use ``self`` to verify both anticipation fees upsert; return ``None``."""
        call_command("load_own_anticipation_fee", "1.25", stdout=StringIO())
        fees = OwnFee.objects.filter(method=OwnMethod.ANTICIPATION).order_by("basketId")
        self.assertEqual(list(fees.values_list("basketId", flat=True)), [117, 333])
        self.assertTrue(all(fee.baseMdr == Decimal("1.25") for fee in fees))
        self.assertTrue(all(fee.value == Decimal("0.0") for fee in fees))
        self.assertTrue(all(fee.network is None and fee.channel is None for fee in fees))

        call_command("load_own_anticipation_fee", "2.5", stdout=StringIO())
        self.assertEqual(OwnFee.objects.filter(method=OwnMethod.ANTICIPATION).count(), 2)
        self.assertTrue(all(
            fee.baseMdr == Decimal("2.5")
            for fee in OwnFee.objects.filter(method=OwnMethod.ANTICIPATION)
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
            method=OwnMethod.CREDIT,
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
