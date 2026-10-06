import itertools
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

import requests
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connections, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from cielo.models import (
    CieloBusiness,
    CieloCardBrand,
    CieloOnboardingNotification,
    CieloPaymentMethod,
    CieloPlan,
    CieloPlanRate,
    CieloSubmissionStatus,
    CieloTransaction,
    CieloTransactionLookupStatus,
    CieloTransactionNotification,
    CieloTransactionNotificationImmutableError,
    cielo_plan_rate_keys,
)
from cielo.services.cielo_api import (
    CieloQuickConfigurationError,
    CieloQuickCredentialsError,
    CieloQuickPreTransmissionError,
    CieloSubmissionOutcome,
    get_cielo_configuration,
    submit_cielo_seller,
)
from cielo.validators import is_valid_cnpj, is_valid_cpf
from quickportal.models import (
    Business,
    BusinessMembership,
    BusinessRole,
    BusinessType,
    DocumentType,
)


VALID_MERCHANT_ID = "f88cc14d-c796-4939-957e-de4dddcb2257"
SELLER_MERCHANT_ID = "4d76b525-e66d-402e-a318-5fd3ce1af7aa"
WEBHOOK_TOKEN = "test-webhook-token"

_sequence = itertools.count(1)


def create_user(**changes):
    index = next(_sequence)
    return get_user_model().objects.create_user(
        username=f"cielo-user-{index}",
        email=f"cielo-user-{index}@example.com",
        password="test",
        **changes,
    )


def create_reseller(
    business_type=BusinessType.RESELLER, parent=None, name=None, document=None
):
    index = next(_sequence)
    return Business.objects.create(
        type=business_type,
        parent=parent,
        document_type=DocumentType.CNPJ,
        document=document or f"{index:014d}",
        name=name or f"Revenda {index}",
        email=f"revenda-{index}@example.com",
        phone="11987654321",
    )


def rate_payloads():
    return [
        {
            "card_brand": brand,
            "method": method,
            "installments": installments,
            "mdr": "1.50",
            "fixed_fee": "0.10",
        }
        for brand, method, installments in cielo_plan_rate_keys()
    ]


def plan_payload(name="Plano padrão", **changes):
    return {
        "name": name,
        "description": "Plano para testes",
        "rates": rate_payloads(),
        **changes,
    }


def create_cielo_plan(owner_business=None, created_by=None, name="Plano Cielo", archived=False):
    created_by = created_by or create_user()
    plan = CieloPlan.objects.create(
        owner_business=owner_business or create_reseller(),
        name=name,
        created_by=created_by,
        archived_at=timezone.now() if archived else None,
        archived_by=created_by if archived else None,
    )
    CieloPlanRate.objects.bulk_create(
        CieloPlanRate(plan=plan, **rate) for rate in rate_payloads()
    )
    return plan


def cielo_payload(document_type="CNPJ", plan=None):
    return {
        **({"plan": plan.pk} if plan is not None else {}),
        **({"contact_name": "Seller Contact"} if document_type == "CNPJ" else {}),
        "website": "https://example.com",
        "birthday_date": "1990-01-01" if document_type == "CPF" else None,
        "business_activity_id": "24" if document_type == "CPF" else None,
        "bank_account": {
            "bank": "001",
            "bank_account_type": "CheckingAccount",
            "number": "1234567890",
            "verifier_digit": "1",
            "agency_number": "1234",
            "document_type": "CPF",
            "document_number": "52998224725",
        },
        "address": {
            "number": "123",
            "complement": "",
            "zip_code": "01001000",
        },
    }


def create_business():
    return Business.objects.create(
        type=BusinessType.STORE,
        document_type=DocumentType.CNPJ,
        document="11222333000181",
        name="Seller Ltda",
        trade_name="Seller",
        email="seller@example.com",
        phone="11987654321",
        landline="",
    )


def cielo_business_values(business, **changes):
    values = {
        "business": business,
        "plan": changes.pop("plan", None) or create_cielo_plan(),
        "status": CieloSubmissionStatus.FAILED,
        "merchant_id": None,
        "last_submitted_at": None,
        "contact_name": "Seller Contact",
        "website": "https://example.com",
        "corporate_name": "Seller Corporate Ltda",
        "fancy_name": "Seller",
        "birthday_date": None,
        "business_activity_id": None,
        "bank": "001",
        "bank_account_type": "CheckingAccount",
        "bank_account_number": "1234567890",
        "bank_account_verifier_digit": "1",
        "bank_agency_number": "1234",
        "bank_agency_digit": "",
        "bank_document_type": "CPF",
        "bank_document_number": "52998224725",
        "address_number": "123",
        "address_complement": "",
        "address_zip_code": "01001000",
        "address_street": "Praça da Sé",
        "address_neighborhood": "Sé",
        "address_city": "São Paulo",
        "address_state": "SP",
    }
    values.update(changes)
    return values


def create_cielo_business(business, **changes):
    return CieloBusiness.objects.create(**cielo_business_values(business, **changes))


class CieloDocumentValidatorTests(APITestCase):
    def test_cpf_mathematical_validation(self):
        self.assertTrue(is_valid_cpf("52998224725"))
        self.assertFalse(is_valid_cpf("52998224726"))
        self.assertFalse(is_valid_cpf("５２９９８２２４７２５"))

    def test_numeric_and_alphanumeric_cnpj_mathematical_validation(self):
        self.assertTrue(is_valid_cnpj("11222333000181"))
        self.assertFalse(is_valid_cnpj("11222333000182"))
        self.assertTrue(is_valid_cnpj("12ABC34501DE35"))
        self.assertFalse(is_valid_cnpj("12ABC34501DE36"))


class CieloSubmissionBusinessRuleTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="cielo-test", email="cielo@example.com", password="test"
        )
        self.user.is_superuser = True
        self.user.full_clean()
        self.user.save(update_fields=["is_superuser"])
        self.client.force_authenticate(self.user)
        self.business = create_business()
        self.scope = create_reseller()
        self.plan = create_cielo_plan(self.scope, created_by=self.user)
        self.url = f"/cielo/businesses/{self.business.pk}/?business={self.scope.pk}"
        self.cnpj_patch = patch(
            "cielo.serializers.fetch_cnpj_registration",
            return_value={
                "name": "Seller Corporate Ltda",
                "trade_name": "Seller",
                "cod_cnae": None,
            },
        )
        self.address_patch = patch(
            "cielo.serializers.fetch_cep_info",
            return_value={
                "street": "Praça da Sé",
                "neighborhood": "Sé",
                "city": "São Paulo",
                "state": "SP",
            },
        )
        self.cnpj_patch.start()
        self.address_patch.start()
        self.addCleanup(self.cnpj_patch.stop)
        self.addCleanup(self.address_patch.stop)

    def test_quick_failures_create_no_record(self):
        Business.objects.filter(pk=self.business.pk).update(
            document_type=DocumentType.CPF,
            document="52998224726",
            name="CPF Seller",
        )
        invalid = cielo_payload(document_type="CPF", plan=self.plan)
        response = self.client.post(self.url, invalid, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(CieloBusiness.objects.exists())

        self.business.document_type = DocumentType.CNPJ
        self.business.document = "11222333000181"
        self.business.full_clean()
        self.business.save(update_fields=["document_type", "document"])

        for error in (
            CieloQuickConfigurationError("missing configuration"),
            CieloQuickCredentialsError("invalid credentials"),
        ):
            with self.subTest(error=type(error).__name__), patch(
                "cielo.views.submit_cielo_seller", side_effect=error
            ):
                response = self.client.post(self.url, cielo_payload(plan=self.plan), format="json")
                self.assertGreaterEqual(response.status_code, 400)
                self.assertFalse(CieloBusiness.objects.exists())

        with patch(
            "cielo.views.submit_cielo_seller",
            side_effect=CieloQuickPreTransmissionError("before transmission"),
        ):
            with self.assertRaises(CieloQuickPreTransmissionError):
                self.client.post(self.url, cielo_payload(plan=self.plan), format="json")
        self.assertFalse(CieloBusiness.objects.exists())

        with patch(
            "cielo.views.submit_cielo_seller", side_effect=RuntimeError("backend")
        ):
            with self.assertRaises(RuntimeError):
                self.client.post(self.url, cielo_payload(plan=self.plan), format="json")
        self.assertEqual(
            CieloBusiness.objects.get().status,
            CieloSubmissionStatus.INTERVENTION_REQUIRED,
        )

    def test_cielo_failure_creates_failed_record(self):
        with patch(
            "cielo.views.submit_cielo_seller",
            return_value=CieloSubmissionOutcome(
                status=CieloSubmissionStatus.FAILED,
                submitted_at=timezone.now(),
            ),
        ):
            response = self.client.post(self.url, cielo_payload(plan=self.plan), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], CieloSubmissionStatus.FAILED)
        self.assertEqual(CieloBusiness.objects.get().status, CieloSubmissionStatus.FAILED)

    def test_unusable_success_creates_intervention_required_record(self):
        with patch(
            "cielo.views.submit_cielo_seller",
            return_value=CieloSubmissionOutcome(
                status=CieloSubmissionStatus.INTERVENTION_REQUIRED,
                submitted_at=timezone.now(),
            ),
        ):
            response = self.client.post(self.url, cielo_payload(plan=self.plan), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.data["status"], CieloSubmissionStatus.INTERVENTION_REQUIRED
        )

    def test_valid_success_creates_sent_record(self):
        with patch(
            "cielo.views.submit_cielo_seller",
            return_value=CieloSubmissionOutcome(
                status=CieloSubmissionStatus.SENT,
                merchant_id=VALID_MERCHANT_ID,
                submitted_at=timezone.now(),
            ),
        ):
            response = self.client.post(self.url, cielo_payload(plan=self.plan), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], CieloSubmissionStatus.SENT)
        self.assertEqual(response.data["merchant_id"], VALID_MERCHANT_ID)

    def test_invalid_cnpj_does_not_call_brasil_api(self):
        self.business.document = "12ABC34501DE36"
        self.business.full_clean()
        self.business.save(update_fields=["document"])
        with patch("cielo.serializers.fetch_cnpj_registration") as fetch_cnpj:
            response = self.client.post(
                self.url,
                cielo_payload(plan=self.plan),
                format="json",
            )

        self.assertEqual(response.status_code, 400)
        fetch_cnpj.assert_not_called()
        self.assertFalse(CieloBusiness.objects.exists())


class CieloRetryCooldownTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="cielo-retry", email="retry@example.com", password="test"
        )
        self.client.force_authenticate(self.user)
        self.business = create_business()
        self.url = f"/cielo/businesses/{self.business.pk}/retry/"

    def test_failed_status_is_required_for_retry(self):
        for seller_status in (
            CieloSubmissionStatus.SENT,
            CieloSubmissionStatus.INTERVENTION_REQUIRED,
        ):
            with self.subTest(status=seller_status):
                CieloBusiness.objects.all().delete()
                create_cielo_business(self.business, status=seller_status)
                with patch("cielo.views.submit_cielo_seller") as submit:
                    response = self.client.post(self.url, {}, format="json")
                self.assertEqual(response.status_code, 409)
                submit.assert_not_called()

    @override_settings(CIELO_RETRY_COOLDOWN_SECONDS=300)
    def test_retry_during_cooldown_is_rejected_without_calling_cielo(self):
        seller = create_cielo_business(
            self.business, last_submitted_at=timezone.now()
        )
        original_updated_at = seller.updated_at
        with patch("cielo.views.submit_cielo_seller") as submit:
            response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response)
        self.assertIn("retry_after_seconds", response.data)
        self.assertIn("retry_available_at", response.data)
        submit.assert_not_called()
        seller.refresh_from_db()
        self.assertEqual(seller.updated_at, original_updated_at)

    @override_settings(CIELO_RETRY_COOLDOWN_SECONDS=300)
    def test_retry_is_allowed_after_cooldown_or_without_previous_submission(self):
        for last_submitted_at in (
            timezone.now() - timedelta(seconds=301),
            None,
        ):
            with self.subTest(last_submitted_at=last_submitted_at):
                CieloBusiness.objects.all().delete()
                create_cielo_business(
                    self.business, last_submitted_at=last_submitted_at
                )
                with patch(
                    "cielo.views.submit_cielo_seller",
                    return_value=CieloSubmissionOutcome(
                        status=CieloSubmissionStatus.SENT,
                        merchant_id=VALID_MERCHANT_ID,
                        submitted_at=timezone.now(),
                    ),
                ) as submit:
                    response = self.client.post(self.url, {}, format="json")
                self.assertEqual(response.status_code, 200)
                submit.assert_called_once()

    def test_invalid_seller_is_rejected_before_calling_cielo(self):
        seller = create_cielo_business(self.business)
        CieloBusiness.objects.filter(pk=seller.pk).update(kyc_status=9)
        with patch("cielo.views.submit_cielo_seller") as submit:
            response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 400)
        submit.assert_not_called()

    def test_retry_persists_timestamp_only_when_transmitted(self):
        original_time = timezone.now() - timedelta(hours=1)
        seller = create_cielo_business(
            self.business, last_submitted_at=original_time
        )
        transmitted_at = timezone.now()
        with patch(
            "cielo.views.submit_cielo_seller",
            return_value=CieloSubmissionOutcome(
                status=CieloSubmissionStatus.FAILED,
                submitted_at=transmitted_at,
            ),
        ):
            self.client.post(self.url, {}, format="json")
        seller.refresh_from_db()
        self.assertEqual(seller.last_submitted_at, transmitted_at)

        seller.last_submitted_at = None
        seller.full_clean()
        seller.save(update_fields=["last_submitted_at"])
        with patch(
            "cielo.views.submit_cielo_seller",
            return_value=CieloSubmissionOutcome(status=CieloSubmissionStatus.FAILED),
        ):
            self.client.post(self.url, {}, format="json")
        seller.refresh_from_db()
        self.assertIsNone(seller.last_submitted_at)


@override_settings(
    CIELO_AUTH_BASE_URL="https://auth.cielo.test",
    CIELO_ONBOARDING_BASE_URL="https://onboarding.cielo.test",
    CIELO_QUERY_BASE_URL="https://query.cielo.test",
    CIELO_MERCHANT_ID=VALID_MERCHANT_ID,
    CIELO_CLIENT_SECRET="secret",
)
class CieloTransmissionClassificationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.configuration = get_cielo_configuration()
        self.seller = SimpleNamespace(
            business=SimpleNamespace(
                document_type="CNPJ",
                document="12ABC34501DE35",
                name="Seller Ltda",
                email="seller@example.com",
                phone="11987654321",
            ),
            contact_name="Seller Contact",
            website="https://example.com",
            corporate_name="Seller Corporate Ltda",
            fancy_name="Seller",
            birthday_date=None,
            business_activity_id=None,
            bank="001",
            bank_account_type="CheckingAccount",
            bank_account_number="1234567890",
            bank_account_verifier_digit="1",
            bank_agency_number="1234",
            bank_agency_digit="",
            bank_document_type="CPF",
            bank_document_number="52998224725",
            address_number="123",
            address_complement="",
            address_zip_code="01001000",
            address_street="Praça da Sé",
            address_neighborhood="Sé",
            address_city="São Paulo",
            address_state="SP",
        )

    @staticmethod
    def auth_response():
        response = Mock(status_code=200)
        response.json.return_value = {
            "access_token": "token",
            "expires_in": 3600,
        }
        return response

    def test_http_error_responses_mark_submission_as_transmitted(self):
        for response_status in (400, 500):
            with self.subTest(status=response_status):
                cache.clear()
                onboarding_response = Mock(status_code=response_status)
                onboarding_response.json.return_value = {"detail": "unavailable"}
                with patch(
                    "cielo.services.cielo_api.requests.post",
                    side_effect=[self.auth_response(), onboarding_response],
                ):
                    outcome = submit_cielo_seller(self.seller)
                self.assertEqual(outcome.status, CieloSubmissionStatus.FAILED)
                self.assertIsNotNone(outcome.submitted_at)

    def test_missing_onboarding_response_is_failed_and_transmitted(self):
        with patch(
            "cielo.services.cielo_api.requests.post",
            side_effect=[self.auth_response(), None],
        ):
            outcome = submit_cielo_seller(self.seller)
        self.assertEqual(outcome.status, CieloSubmissionStatus.FAILED)
        self.assertIsNotNone(outcome.submitted_at)

    def test_authentication_service_failure_is_failed_before_transmission(self):
        auth_response = Mock(status_code=503)
        auth_response.json.return_value = {"detail": "unavailable"}
        with patch(
            "cielo.services.cielo_api.requests.post",
            return_value=auth_response,
        ):
            outcome = submit_cielo_seller(self.seller)
        self.assertEqual(outcome.status, CieloSubmissionStatus.FAILED)
        self.assertIsNone(outcome.submitted_at)

    def test_unexpected_pre_transmission_failure_is_classified(self):
        with patch(
            "cielo.services.cielo_api.build_cielo_payload",
            side_effect=RuntimeError("payload construction failed"),
        ):
            with self.assertRaises(CieloQuickPreTransmissionError):
                submit_cielo_seller(self.seller)

    def test_pre_transmission_connection_failures_do_not_mark_submission(self):
        for error in (
            requests.ConnectTimeout("connect timeout"),
            requests.ConnectionError("dns failure"),
        ):
            with self.subTest(error=type(error).__name__):
                cache.clear()
                with patch(
                    "cielo.services.cielo_api.requests.post",
                    side_effect=[self.auth_response(), error],
                ):
                    outcome = submit_cielo_seller(self.seller)
                self.assertIsNone(outcome.submitted_at)

    def test_read_timeout_and_connection_reset_mark_submission_as_transmitted(self):
        for error in (
            requests.ReadTimeout("read timeout"),
            requests.ConnectionError(ConnectionResetError("reset")),
        ):
            with self.subTest(error=type(error).__name__):
                cache.clear()
                with patch(
                    "cielo.services.cielo_api.requests.post",
                    side_effect=[self.auth_response(), error],
                ):
                    outcome = submit_cielo_seller(self.seller)
                self.assertIsNotNone(outcome.submitted_at)


@override_settings(CIELO_RETRY_COOLDOWN_SECONDS=300)
class CieloAtomicRetryTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="cielo-concurrent",
            email="concurrent@example.com",
            password="test",
        )
        self.business = create_business()
        create_cielo_business(self.business)
        self.url = f"/cielo/businesses/{self.business.pk}/retry/"

    def test_concurrent_retries_only_submit_once(self):
        first_submission_started = threading.Event()
        release_first_submission = threading.Event()

        def submit(_seller):
            first_submission_started.set()
            release_first_submission.wait(timeout=5)
            return CieloSubmissionOutcome(
                status=CieloSubmissionStatus.FAILED,
                submitted_at=timezone.now(),
            )

        def retry():
            try:
                client = APIClient()
                client.force_authenticate(self.user)
                return client.post(self.url, {}, format="json").status_code
            finally:
                connections.close_all()

        with patch("cielo.views.submit_cielo_seller", side_effect=submit) as mocked:
            with ThreadPoolExecutor(max_workers=2) as executor:
                first = executor.submit(retry)
                self.assertTrue(first_submission_started.wait(timeout=5))
                second = executor.submit(retry)
                release_first_submission.set()
                statuses = sorted([first.result(timeout=10), second.result(timeout=10)])

        self.assertEqual(statuses, [200, 429])
        self.assertEqual(mocked.call_count, 1)


def kyc_notification(status=2, merchant_id=SELLER_MERCHANT_ID):
    return {
        "ChangeType": 20,
        "MasterMerchantId": VALID_MERCHANT_ID,
        "Data": {"SubordinateMerchantId": merchant_id, "Status": status},
    }


def bank_account_notification(status=3, merchant_id=SELLER_MERCHANT_ID):
    return {
        "ChangeType": 21,
        "MasterMerchantId": VALID_MERCHANT_ID,
        "Data": {
            "MerchantId": merchant_id,
            "MerchantType": "Subordinate",
            "Status": status,
            "AccountNumber": "123",
            "AccountDigit": "1",
            "AgencyNumber": "3581",
            "AgencyDigit": "x",
            "CompeCode": "260",
            "BankAccountType": 1,
            "DocumentNumber": "45224563215",
            "DocumentType": 2,
        },
    }


def onboarding_notification(onboarding=2, kyc=2, bank_account=3):
    return {
        "ChangeType": 23,
        "MasterMerchantId": VALID_MERCHANT_ID,
        "Data": {
            "SubordinateMerchantId": SELLER_MERCHANT_ID,
            "OnboardingStatus": onboarding,
            "KycAnalysisInfo": {"Status": kyc},
            "BankAccountValidation": {"Status": bank_account},
        },
    }


@override_settings(CIELO_WEBHOOK_TOKEN=WEBHOOK_TOKEN, CIELO_MERCHANT_ID=VALID_MERCHANT_ID)
class CieloOnboardingNotificationEndpointTests(APITestCase):
    url = "/cielo/onboarding/notifications/"

    def setUp(self):
        self.seller = create_cielo_business(
            create_business(),
            status=CieloSubmissionStatus.SENT,
            merchant_id=SELLER_MERCHANT_ID,
            last_submitted_at=timezone.now(),
        )

    def notify(self, payload, token=WEBHOOK_TOKEN):
        headers = {} if token is None else {"HTTP_X_CIELO_WEBHOOK_TOKEN": token}
        return self.client.post(self.url, payload, format="json", **headers)

    def assert_nothing_stored(self):
        self.assertFalse(CieloOnboardingNotification.objects.exists())
        self.seller.refresh_from_db()
        self.assertIsNone(self.seller.kyc_status)
        self.assertIsNone(self.seller.kyc_status_updated_at)

    def test_token_is_required(self):
        for token in (None, "", "wrong-token"):
            with self.subTest(token=token):
                response = self.notify(kyc_notification(), token=token)
                self.assertEqual(response.status_code, 401)
                self.assert_nothing_stored()

        response = self.notify(kyc_notification())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {})
        self.assertEqual(CieloOnboardingNotification.objects.count(), 1)

    def test_mismatched_master_merchant_is_forbidden(self):
        payload = kyc_notification()
        payload["MasterMerchantId"] = SELLER_MERCHANT_ID
        response = self.notify(payload)

        self.assertEqual(response.status_code, 403)
        self.assert_nothing_stored()

    def test_each_change_type_updates_only_its_own_status(self):
        cases = (
            (kyc_notification(status=1), "kyc_status", 1),
            (bank_account_notification(status=2), "bank_account_status", 2),
        )
        status_fields = ("kyc_status", "bank_account_status", "onboarding_status")
        for payload, field, value in cases:
            with self.subTest(field=field):
                CieloBusiness.objects.filter(pk=self.seller.pk).update(
                    **{name: None for name in status_fields},
                    **{f"{name}_updated_at": None for name in status_fields},
                )
                response = self.notify(payload)
                self.assertEqual(response.status_code, 200)

                notification = CieloOnboardingNotification.objects.latest("pk")
                self.seller.refresh_from_db()
                self.assertEqual(notification.cielo_business, self.seller)
                self.assertEqual(notification.merchant_id, SELLER_MERCHANT_ID)
                for name in status_fields:
                    expected = value if name == field else None
                    self.assertEqual(getattr(notification, name), expected)
                    self.assertEqual(getattr(self.seller, name), expected)
                    self.assertEqual(
                        getattr(self.seller, f"{name}_updated_at"),
                        notification.received_at if name == field else None,
                    )

    def test_onboarding_notification_updates_all_statuses(self):
        response = self.notify(
            onboarding_notification(onboarding=3, kyc=2, bank_account=4)
        )

        self.assertEqual(response.status_code, 200)
        notification = CieloOnboardingNotification.objects.get()
        self.seller.refresh_from_db()
        self.assertEqual(
            (
                self.seller.onboarding_status,
                self.seller.kyc_status,
                self.seller.bank_account_status,
            ),
            (3, 2, 4),
        )
        self.assertEqual(
            (
                notification.onboarding_status,
                notification.kyc_status,
                notification.bank_account_status,
            ),
            (3, 2, 4),
        )
        self.assertEqual(self.seller.onboarding_status_updated_at, notification.received_at)
        self.assertEqual(self.seller.kyc_status_updated_at, notification.received_at)
        self.assertEqual(
            self.seller.bank_account_status_updated_at, notification.received_at
        )
        self.assertEqual(self.seller.status, CieloSubmissionStatus.SENT)

    def test_onboarding_notification_updates_only_provided_statuses(self):
        previous_update = timezone.now() - timedelta(days=1)
        CieloBusiness.objects.filter(pk=self.seller.pk).update(
            bank_account_status=2,
            bank_account_status_updated_at=previous_update,
        )
        payload = onboarding_notification(onboarding=1, kyc=2)
        del payload["Data"]["BankAccountValidation"]

        response = self.notify(payload)

        self.assertEqual(response.status_code, 200)
        notification = CieloOnboardingNotification.objects.get()
        self.assertIsNone(notification.bank_account_status)
        self.seller.refresh_from_db()
        self.assertEqual(self.seller.onboarding_status, 1)
        self.assertEqual(self.seller.kyc_status, 2)
        self.assertEqual(self.seller.kyc_status_updated_at, notification.received_at)
        self.assertEqual(self.seller.bank_account_status, 2)
        self.assertEqual(self.seller.bank_account_status_updated_at, previous_update)

    def test_unknown_merchant_is_stored_without_seller(self):
        unknown_merchant_id = "11111111-2222-4333-8444-555555555555"
        response = self.notify(kyc_notification(merchant_id=unknown_merchant_id))

        self.assertEqual(response.status_code, 200)
        notification = CieloOnboardingNotification.objects.get()
        self.assertIsNone(notification.cielo_business)
        self.assertEqual(notification.merchant_id, unknown_merchant_id)
        self.seller.refresh_from_db()
        self.assertIsNone(self.seller.kyc_status)

    def test_duplicate_delivery_stores_two_events_and_same_state(self):
        payload = onboarding_notification()
        self.assertEqual(self.notify(payload).status_code, 200)
        self.seller.refresh_from_db()
        first_state = (
            self.seller.onboarding_status,
            self.seller.kyc_status,
            self.seller.bank_account_status,
        )

        self.assertEqual(self.notify(payload).status_code, 200)

        self.assertEqual(CieloOnboardingNotification.objects.count(), 2)
        self.seller.refresh_from_db()
        self.assertEqual(
            (
                self.seller.onboarding_status,
                self.seller.kyc_status,
                self.seller.bank_account_status,
            ),
            first_state,
        )

    def test_invalid_seller_keeps_notification_without_applying_it(self):
        CieloBusiness.objects.filter(pk=self.seller.pk).update(kyc_status=9)
        with self.assertLogs("cielo.services.onboarding_notifications", "ERROR"):
            response = self.notify(bank_account_notification(status=3))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(CieloOnboardingNotification.objects.get().bank_account_status, 3)
        self.seller.refresh_from_db()
        self.assertIsNone(self.seller.bank_account_status)
        self.assertIsNone(self.seller.bank_account_status_updated_at)

    def test_unlisted_status_is_stored_only_on_notification(self):
        previous_update = timezone.now() - timedelta(days=1)
        CieloBusiness.objects.filter(pk=self.seller.pk).update(
            bank_account_status=2,
            bank_account_status_updated_at=previous_update,
        )
        with self.assertLogs("cielo.services.onboarding_notifications", "WARNING"):
            response = self.notify(
                onboarding_notification(onboarding=1, kyc=2, bank_account=9)
            )

        self.assertEqual(response.status_code, 200)
        notification = CieloOnboardingNotification.objects.get()
        self.assertEqual(notification.bank_account_status, 9)
        self.seller.refresh_from_db()
        self.assertEqual(self.seller.bank_account_status, 2)
        self.assertEqual(self.seller.bank_account_status_updated_at, previous_update)
        self.assertEqual(self.seller.kyc_status, 2)
        self.assertEqual(self.seller.onboarding_status, 1)
        self.seller.full_clean()


class CieloPlanModelTests(TestCase):
    def setUp(self):
        self.user = create_user()
        self.reseller = create_reseller()

    def test_store_cannot_own_plan(self):
        store = create_reseller(BusinessType.STORE, parent=self.reseller)
        plan = CieloPlan(owner_business=store, name="Loja", created_by=self.user)

        with self.assertRaises(ValidationError) as context:
            plan.full_clean()

        self.assertIn("owner_business", context.exception.message_dict)

    def test_plan_and_rates_cannot_change_after_creation(self):
        plan = create_cielo_plan(self.reseller, created_by=self.user)

        for field, value in (("name", "Outro nome"), ("description", "Outra")):
            with self.subTest(field=field):
                plan.refresh_from_db()
                setattr(plan, field, value)
                with self.assertRaises(ValidationError):
                    plan.save()

        rate = plan.rates.first()
        rate.mdr = Decimal("9.99")
        with self.assertRaises(ValidationError):
            rate.save()

    def test_rate_installments_must_match_the_method(self):
        plan = create_cielo_plan(self.reseller, created_by=self.user)
        for method, installments in (
            (CieloPaymentMethod.DEBIT, 1),
            (CieloPaymentMethod.CREDIT, None),
            (CieloPaymentMethod.CREDIT, 0),
            (CieloPaymentMethod.CREDIT, 13),
        ):
            with self.subTest(method=method, installments=installments):
                rate = CieloPlanRate(
                    plan=plan,
                    card_brand=CieloCardBrand.ELO,
                    method=method,
                    installments=installments,
                    mdr="1.00",
                    fixed_fee="0.00",
                )
                with self.assertRaises(ValidationError) as context:
                    rate.full_clean(validate_unique=False, validate_constraints=False)
                self.assertIn("installments", context.exception.message_dict)

    def test_database_rejects_a_second_debit_rate_for_a_brand(self):
        plan = create_cielo_plan(self.reseller, created_by=self.user)

        with self.assertRaises(IntegrityError), transaction.atomic():
            CieloPlanRate.objects.bulk_create(
                [
                    CieloPlanRate(
                        plan=plan,
                        card_brand=CieloCardBrand.VISA,
                        method=CieloPaymentMethod.DEBIT,
                        installments=None,
                        mdr="2.00",
                        fixed_fee="0.00",
                    )
                ]
            )


class CieloPlanEndpointTests(APITestCase):
    def setUp(self):
        self.user = create_user()
        self.reseller = create_reseller(name="Revenda")
        self.re_reseller = create_reseller(
            BusinessType.RE_RESELLER, parent=self.reseller, name="Sub-revenda"
        )
        self.store = create_reseller(BusinessType.STORE, parent=self.re_reseller)
        # A viewer of the reseller can access the whole hierarchy below it.
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        self.client.force_authenticate(self.user)

    def plans_url(self, business, **params):
        query = "&".join(
            f"{key}={value}" for key, value in {"business": business.pk, **params}.items()
        )
        return f"/cielo/plans/?{query}"

    def plan_url(self, plan, business, action=""):
        suffix = f"{action}/" if action else ""
        return f"/cielo/plans/{plan.pk}/{suffix}?business={business.pk}"

    def test_viewer_creates_a_plan_with_all_its_rates(self):
        response = self.client.post(
            self.plans_url(self.reseller), plan_payload(), format="json"
        )

        self.assertEqual(response.status_code, 201, response.data)
        plan = CieloPlan.objects.get()
        self.assertEqual(plan.owner_business, self.reseller)
        self.assertEqual(plan.created_by, self.user)
        self.assertIsNone(plan.archived_at)
        self.assertEqual(plan.rates.count(), 39)
        self.assertEqual(
            [
                (rate["card_brand"], rate["method"], rate["installments"])
                for rate in response.data["rates"]
            ],
            cielo_plan_rate_keys(),
        )
        self.assertEqual(response.data["rates"][0]["mdr"], "1.50")
        self.assertEqual(response.data["rates"][0]["fixed_fee"], "0.10")

    def test_business_query_parameter_is_required_and_must_be_accessible(self):
        other = create_reseller()
        self.assertEqual(self.client.get("/cielo/plans/").status_code, 400)
        response = self.client.post("/cielo/plans/", plan_payload(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("business", response.data)
        self.assertEqual(self.client.get(self.plans_url(other)).status_code, 404)
        response = self.client.post(self.plans_url(other), plan_payload(), format="json")
        self.assertEqual(response.status_code, 404)
        self.assertFalse(CieloPlan.objects.exists())

    def test_store_cannot_own_a_plan(self):
        response = self.client.post(
            self.plans_url(self.store), plan_payload(), format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("business", response.data)
        self.assertFalse(CieloPlan.objects.exists())

    def test_plan_names_are_unique_per_business_including_archived_plans(self):
        create_cielo_plan(self.reseller, name="Básico", archived=True)

        response = self.client.post(
            self.plans_url(self.reseller), plan_payload("Básico"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

        for business, name in ((self.re_reseller, "Básico"), (self.reseller, "básico")):
            with self.subTest(business=business.name, name=name):
                response = self.client.post(
                    self.plans_url(business), plan_payload(name), format="json"
                )
                self.assertEqual(response.status_code, 201, response.data)

    def test_plan_must_contain_every_rate_exactly_once(self):
        def with_rate(index, **changes):
            rates = rate_payloads()
            rates[index] = {**rates[index], **changes}
            return rates

        missing_value = rate_payloads()
        del missing_value[5]["mdr"]
        cases = {
            "missing rate": rate_payloads()[:-1],
            "duplicated rate": [*rate_payloads()[:-1], rate_payloads()[0]],
            "extra rate": [*rate_payloads(), rate_payloads()[0]],
            "debit with installments": with_rate(0, installments=1),
            "credit without installments": with_rate(1, installments=None),
            "credit above 12x": with_rate(12, installments=13),
            "unknown brand": with_rate(0, card_brand="Amex"),
            "mdr above 100": with_rate(3, mdr="100.01"),
            "negative mdr": with_rate(3, mdr="-0.01"),
            "negative fixed fee": with_rate(3, fixed_fee="-0.01"),
            "missing value": missing_value,
            "no rates": [],
        }
        for case, rates in cases.items():
            with self.subTest(case=case):
                response = self.client.post(
                    self.plans_url(self.reseller),
                    plan_payload(rates=rates),
                    format="json",
                )
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("rates", response.data)
        self.assertFalse(CieloPlan.objects.exists())

    def test_name_and_rate_values_are_required(self):
        payload = plan_payload()
        del payload["name"]
        response = self.client.post(self.plans_url(self.reseller), payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

        payload = plan_payload()
        del payload["description"]
        response = self.client.post(self.plans_url(self.reseller), payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)

    def test_list_shows_only_the_business_plans_split_by_archive_state(self):
        older = create_cielo_plan(self.reseller, name="Antigo")
        newer = create_cielo_plan(self.reseller, name="Novo")
        archived_first = create_cielo_plan(self.reseller, name="Arquivado 1", archived=True)
        archived_last = create_cielo_plan(self.reseller, name="Arquivado 2", archived=True)
        CieloPlan.objects.filter(pk=archived_first.pk).update(
            archived_at=timezone.now() - timedelta(days=1)
        )
        child_plan = create_cielo_plan(self.re_reseller, name="Filho")
        create_cielo_plan(create_reseller(), name="Outra revenda")

        def ids(url):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, response.data)
            return [plan["id"] for plan in response.data]

        self.assertEqual(ids(self.plans_url(self.reseller)), [newer.pk, older.pk])
        self.assertEqual(
            ids(self.plans_url(self.reseller, archived="true")),
            [archived_last.pk, archived_first.pk],
        )
        self.assertEqual(ids(self.plans_url(self.re_reseller)), [child_plan.pk])
        self.assertEqual(ids(self.plans_url(self.re_reseller, archived="true")), [])
        self.assertEqual(ids(self.plans_url(self.store)), [])
        self.assertEqual(
            self.client.get(self.plans_url(self.reseller, archived="yes")).status_code,
            400,
        )

    def test_plans_of_other_businesses_are_not_found(self):
        child_plan = create_cielo_plan(self.re_reseller, name="Filho")
        parent_plan = create_cielo_plan(self.reseller, name="Pai", archived=True)

        for plan, scope in ((child_plan, self.reseller), (parent_plan, self.re_reseller)):
            for action, method in (("", "get"), ("archive", "post"), ("unarchive", "post")):
                with self.subTest(plan=plan.name, action=action or "retrieve"):
                    response = getattr(self.client, method)(
                        self.plan_url(plan, scope, action), format="json"
                    )
                    self.assertEqual(response.status_code, 404)

        child_plan.refresh_from_db()
        parent_plan.refresh_from_db()
        self.assertIsNone(child_plan.archived_at)
        self.assertIsNotNone(parent_plan.archived_at)

    def test_retrieve_returns_active_and_archived_plans_with_rates(self):
        for archived in (False, True):
            with self.subTest(archived=archived):
                plan = create_cielo_plan(
                    self.reseller, name=f"Plano {archived}", archived=archived
                )
                response = self.client.get(self.plan_url(plan, self.reseller))
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["name"], plan.name)
                self.assertEqual(response.data["archived_at"] is not None, archived)
                self.assertEqual(len(response.data["rates"]), 39)

    def test_viewer_archives_and_unarchives_plans(self):
        plan = create_cielo_plan(self.reseller)

        response = self.client.post(self.plan_url(plan, self.reseller, "archive"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNotNone(response.data["archived_at"])
        plan.refresh_from_db()
        self.assertIsNotNone(plan.archived_at)
        self.assertEqual(plan.archived_by, self.user)
        response = self.client.post(self.plan_url(plan, self.reseller, "archive"))
        self.assertEqual(response.status_code, 409)

        response = self.client.post(self.plan_url(plan, self.reseller, "unarchive"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data["archived_at"])
        plan.refresh_from_db()
        self.assertIsNone(plan.archived_at)
        self.assertIsNone(plan.archived_by)
        response = self.client.post(self.plan_url(plan, self.reseller, "unarchive"))
        self.assertEqual(response.status_code, 409)

    def test_options_describes_the_create_fields(self):
        response = self.client.options(self.plans_url(self.reseller))

        self.assertEqual(response.status_code, 200)
        self.assertIn("rates", response.data["actions"]["POST"])

    def test_there_are_no_update_or_delete_endpoints(self):
        plan = create_cielo_plan(self.reseller, name="Fixo")
        payload = plan_payload("Alterado")

        for url in (self.plan_url(plan, self.reseller), self.plans_url(self.reseller)):
            for method in ("put", "patch", "delete"):
                with self.subTest(url=url, method=method):
                    response = getattr(self.client, method)(url, payload, format="json")
                    self.assertEqual(response.status_code, 405)

        plan.refresh_from_db()
        self.assertEqual(plan.name, "Fixo")
        self.assertEqual(plan.rates.count(), 39)

    def test_archiving_keeps_the_plan_on_sellers_and_unarchiving_restores_it(self):
        plan = create_cielo_plan(self.reseller)
        seller = create_cielo_business(create_business(), plan=plan)

        self.client.post(self.plan_url(plan, self.reseller, "archive"))
        seller.refresh_from_db()
        self.assertEqual(seller.plan, plan)
        seller.full_clean()
        self.assertEqual(self.client.get(self.plans_url(self.reseller)).data, [])

        self.client.post(self.plan_url(plan, self.reseller, "unarchive"))
        self.assertEqual(
            [item["id"] for item in self.client.get(self.plans_url(self.reseller)).data],
            [plan.pk],
        )


class CieloSellerPlanTests(APITestCase):
    def setUp(self):
        self.user = create_user()
        self.reseller = create_reseller()
        self.re_reseller = create_reseller(BusinessType.RE_RESELLER, parent=self.reseller)
        self.business = create_reseller(
            BusinessType.STORE, parent=self.re_reseller, document="11222333000181"
        )
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )
        self.client.force_authenticate(self.user)
        self.plan = create_cielo_plan(self.reseller, created_by=self.user)
        self.url = f"/cielo/businesses/{self.business.pk}/?business={self.reseller.pk}"
        for target, value in (
            (
                "cielo.serializers.fetch_cnpj_registration",
                {"name": "Seller Corporate Ltda", "trade_name": "Seller", "cod_cnae": None},
            ),
            (
                "cielo.serializers.fetch_cep_info",
                {"street": "Praça da Sé", "neighborhood": "Sé", "city": "São Paulo", "state": "SP"},
            ),
            (
                "cielo.views.submit_cielo_seller",
                CieloSubmissionOutcome(
                    status=CieloSubmissionStatus.SENT,
                    merchant_id=VALID_MERCHANT_ID,
                    submitted_at=timezone.now(),
                ),
            ),
        ):
            patcher = patch(target, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_seller_is_created_with_an_active_plan_of_the_selected_business(self):
        response = self.client.post(self.url, cielo_payload(plan=self.plan), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(CieloBusiness.objects.get().plan, self.plan)

    def test_seller_requires_the_business_query_parameter(self):
        response = self.client.post(
            f"/cielo/businesses/{self.business.pk}/",
            cielo_payload(plan=self.plan),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("business", response.data)
        self.assertFalse(CieloBusiness.objects.exists())

    def test_seller_without_a_valid_plan_is_rejected(self):
        cases = {
            "without plan": cielo_payload(),
            "archived plan": cielo_payload(
                plan=create_cielo_plan(self.reseller, name="Arquivado", archived=True)
            ),
            "subordinate business plan": cielo_payload(
                plan=create_cielo_plan(self.re_reseller, name="Filho")
            ),
            "unrelated business plan": cielo_payload(plan=create_cielo_plan(name="Outro")),
        }
        for case, payload in cases.items():
            with self.subTest(case=case):
                response = self.client.post(self.url, payload, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("plan", response.data)
        self.assertFalse(CieloBusiness.objects.exists())

    def test_plan_of_the_superior_business_is_rejected(self):
        url = f"/cielo/businesses/{self.business.pk}/?business={self.re_reseller.pk}"

        response = self.client.post(url, cielo_payload(plan=self.plan), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("plan", response.data)
        self.assertFalse(CieloBusiness.objects.exists())

    def test_model_rejects_an_archived_plan_only_for_new_sellers(self):
        archived = create_cielo_plan(self.reseller, name="Arquivado", archived=True)
        new_seller = CieloBusiness(**cielo_business_values(self.business, plan=archived))

        with self.assertRaises(ValidationError) as context:
            new_seller.full_clean()
        self.assertEqual(
            context.exception.message_dict,
            {"plan": ["An archived plan cannot be assigned to a new seller."]},
        )

        existing = create_cielo_business(self.business, plan=archived)
        existing.full_clean()

    def test_retrying_a_failed_seller_with_an_archived_plan_succeeds(self):
        seller = create_cielo_business(self.business, plan=self.plan)
        CieloPlan.objects.filter(pk=self.plan.pk).update(
            archived_at=timezone.now(), archived_by=self.user
        )

        response = self.client.post(
            f"/cielo/businesses/{self.business.pk}/retry/", {}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.data)
        seller.refresh_from_db()
        self.assertEqual(seller.status, CieloSubmissionStatus.SENT)
        self.assertEqual(seller.plan, self.plan)


PAYMENT_ID = "507821c5-7067-49ff-928f-a3eb1e256148"
OTHER_MERCHANT_ID = "9140ca78-3955-44a5-bd44-793370afef94"


def lookup_response(payment_id=PAYMENT_ID, merchant_id=SELLER_MERCHANT_ID, **payment):
    """A Cielo lookup response like the documented sample, with ``payment``
    overriding ``Payment`` keys; a ``None`` value removes the key."""
    response = {
        "MerchantId": merchant_id,
        "MerchantOrderId": "2014111701",
        "IsSplitted": False,
        "Customer": {"Name": "Comprador", "Address": {}},
        "Payment": {
            "ServiceTaxAmount": 0,
            "Installments": 3,
            "Capture": True,
            "CreditCard": {
                "CardNumber": "455187******0181",
                "Holder": "Teste Holder",
                "ExpirationDate": "12/2030",
                "Brand": "Visa",
            },
            "PaymentId": payment_id,
            "Type": "CreditCard",
            "Amount": 10000,
            "ReceivedDate": "2017-12-10 18:18:18",
            "Currency": "BRL",
            "Country": "BRA",
            "Provider": "Simulado",
            "Status": 2,
        },
    }
    for key, value in payment.items():
        if value is None:
            response["Payment"].pop(key, None)
        else:
            response["Payment"][key] = value
    return response


def http_response(status_code=200, body=None):
    return Mock(status_code=status_code, json=Mock(return_value=body))


@override_settings(
    CIELO_WEBHOOK_TOKEN=WEBHOOK_TOKEN,
    CIELO_AUTH_BASE_URL="https://auth.cielo.test",
    CIELO_ONBOARDING_BASE_URL="https://onboarding.cielo.test",
    CIELO_QUERY_BASE_URL="https://query.cielo.test",
    CIELO_MERCHANT_ID=VALID_MERCHANT_ID,
    CIELO_CLIENT_SECRET="secret",
)
class CieloTransactionNotificationEndpointTests(APITestCase):
    url = "/cielo/transactions/notifications/"

    def setUp(self):
        self.seller = create_cielo_business(
            create_business(),
            status=CieloSubmissionStatus.SENT,
            merchant_id=SELLER_MERCHANT_ID,
        )
        token_patcher = patch(
            "cielo.services.cielo_api.get_cielo_token", return_value="query-token"
        )
        token_patcher.start()
        self.addCleanup(token_patcher.stop)
        get_patcher = patch("cielo.services.cielo_api.requests.get")
        self.http_get = get_patcher.start()
        self.addCleanup(get_patcher.stop)
        self.http_get.return_value = http_response(body=lookup_response())

    def notify(self, change_type=1, payment_id=PAYMENT_ID, token=WEBHOOK_TOKEN, payload=None):
        if payload is None:
            payload = {"PaymentId": payment_id, "ChangeType": change_type}
        headers = {} if token is None else {"HTTP_X_CIELO_WEBHOOK_TOKEN": token}
        return self.client.post(self.url, payload, format="json", **headers)

    def assert_nothing_stored(self):
        self.assertFalse(CieloTransactionNotification.objects.exists())
        self.assertFalse(CieloTransaction.objects.exists())
        self.http_get.assert_not_called()

    def test_missing_or_invalid_token_is_unauthorized(self):
        for token in (None, "", "wrong-token"):
            with self.subTest(token=token):
                response = self.notify(token=token)
                self.assertEqual(response.status_code, 401)
                self.assert_nothing_stored()

    @override_settings(CIELO_WEBHOOK_TOKEN="")
    def test_missing_webhook_token_configuration_is_a_server_error(self):
        with self.assertLogs("cielo.views", "ERROR"):
            response = self.notify()

        self.assertEqual(response.status_code, 500)
        self.assert_nothing_stored()

    def test_malformed_payload_is_rejected(self):
        payloads = (
            [PAYMENT_ID, 1],
            {"ChangeType": 1},
            {"PaymentId": "not-a-uuid", "ChangeType": 1},
            {"PaymentId": 123, "ChangeType": 1},
            {"PaymentId": PAYMENT_ID},
            {"PaymentId": PAYMENT_ID, "ChangeType": -1},
            {"PaymentId": PAYMENT_ID, "ChangeType": "1"},
            {"PaymentId": PAYMENT_ID, "ChangeType": True},
        )
        for payload in payloads:
            with self.subTest(payload=payload):
                with self.assertLogs("cielo.views", "WARNING"):
                    response = self.notify(payload=payload)
                self.assertEqual(response.status_code, 400)
                self.assert_nothing_stored()

    def test_payment_status_change_creates_looked_up_transaction(self):
        response = self.notify(payload={
            "PaymentId": PAYMENT_ID,
            "ChangeType": 1,
            "RecurrentPaymentId": "ignored",
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {})
        self.http_get.assert_called_once_with(
            f"https://query.cielo.test/1/sales/{PAYMENT_ID}",
            headers={
                "Authorization": "Bearer query-token",
                "Accept": "application/json",
            },
            timeout=10,
        )
        transaction = CieloTransaction.objects.get()
        notification = CieloTransactionNotification.objects.get()
        self.assertEqual(notification.transaction, transaction)
        self.assertEqual(notification.payment_id, PAYMENT_ID)
        self.assertEqual(notification.change_type, 1)
        self.assertEqual(transaction.payment_id, PAYMENT_ID)
        self.assertEqual(transaction.merchant_id, SELLER_MERCHANT_ID)
        self.assertEqual(transaction.cielo_business, self.seller)
        self.assertEqual(transaction.installments, 3)
        self.assertEqual(transaction.amount, 10000)
        # 18:18:18 in São Paulo (UTC-2 in December 2017, daylight saving time).
        self.assertEqual(
            transaction.received_date,
            datetime(2017, 12, 10, 20, 18, 18, tzinfo=dt_timezone.utc),
        )
        self.assertEqual(transaction.payment_type, "CreditCard")
        self.assertEqual(transaction.brand, "Visa")
        self.assertEqual(transaction.provider, "Simulado")
        self.assertEqual(transaction.status, 2)
        self.assertEqual(transaction.lookup_status, CieloTransactionLookupStatus.SUCCESS)
        self.assertIsNotNone(transaction.last_lookup_at)
        self.assertEqual(transaction.lookup_error, "")

    def test_existing_payment_is_updated_with_a_second_notification(self):
        self.notify()
        transaction = CieloTransaction.objects.get()
        self.http_get.return_value = http_response(
            body=lookup_response(Status=10)
        )

        # A case variant of the same PaymentId updates the same transaction.
        response = self.notify(payment_id=PAYMENT_ID.upper())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(CieloTransaction.objects.get().pk, transaction.pk)
        transaction.refresh_from_db()
        self.assertEqual(transaction.status, 10)
        self.assertEqual(
            list(transaction.notifications.values_list("change_type", "payment_id")),
            [(1, PAYMENT_ID), (1, PAYMENT_ID)],
        )

    def test_partial_cancellation_triggers_a_lookup(self):
        response = self.notify(change_type=25)

        self.assertEqual(response.status_code, 200)
        self.http_get.assert_called_once()
        transaction = CieloTransaction.objects.get()
        self.assertEqual(transaction.lookup_status, CieloTransactionLookupStatus.SUCCESS)
        self.assertEqual(transaction.status, 2)
        self.assertEqual(
            CieloTransactionNotification.objects.get().transaction, transaction
        )

    def test_failed_lookup_for_new_payment_stores_only_the_failure(self):
        cases = (
            ("HTTP 404", {"return_value": http_response(404, [{"Code": "NotFound"}])}),
            ("Timeout", {"side_effect": requests.ReadTimeout()}),
        )
        for reason, behavior in cases:
            with self.subTest(reason=reason):
                self.http_get.reset_mock(return_value=True, side_effect=True)
                self.http_get.configure_mock(**behavior)
                payment_id = str(uuid4())

                with self.assertLogs(
                    "cielo.services.transaction_notifications", "WARNING"
                ):
                    response = self.notify(payment_id=payment_id)

                self.assertEqual(response.status_code, 200)
                transaction = CieloTransaction.objects.get(payment_id=payment_id)
                self.assertEqual(
                    transaction.lookup_status, CieloTransactionLookupStatus.FAILED
                )
                self.assertEqual(transaction.lookup_error, reason)
                self.assertIsNotNone(transaction.last_lookup_at)
                for field in (
                    "merchant_id",
                    "cielo_business",
                    "installments",
                    "amount",
                    "received_date",
                    "payment_type",
                    "brand",
                    "provider",
                    "status",
                    "raw_response",
                ):
                    self.assertIsNone(getattr(transaction, field), field)
                self.assertTrue(
                    CieloTransactionNotification.objects.filter(
                        payment_id=payment_id, transaction=transaction
                    ).exists()
                )

    def test_failed_lookup_keeps_previous_values(self):
        self.notify()
        before = CieloTransaction.objects.values().get()
        self.http_get.return_value = http_response(500)

        with self.assertLogs("cielo.services.transaction_notifications", "WARNING"):
            response = self.notify()

        self.assertEqual(response.status_code, 200)
        after = CieloTransaction.objects.values().get()
        changed = {field for field in before if before[field] != after[field]}
        self.assertEqual(
            changed, {"lookup_status", "last_lookup_at", "lookup_error", "updated_at"}
        )
        self.assertEqual(after["lookup_status"], CieloTransactionLookupStatus.FAILED)
        self.assertEqual(after["lookup_error"], "HTTP 500")

    def test_successful_lookup_after_failure_clears_the_error(self):
        self.http_get.return_value = http_response(503)
        with self.assertLogs("cielo.services.transaction_notifications", "WARNING"):
            self.notify()
        self.http_get.return_value = http_response(body=lookup_response())

        self.notify()

        transaction = CieloTransaction.objects.get()
        self.assertEqual(transaction.lookup_status, CieloTransactionLookupStatus.SUCCESS)
        self.assertEqual(transaction.lookup_error, "")
        self.assertEqual(transaction.amount, 10000)

    def test_other_change_type_is_stored_without_lookup(self):
        response = self.notify(change_type=7)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(CieloTransactionNotification.objects.get().transaction)
        self.assertFalse(CieloTransaction.objects.exists())

        self.notify()
        transaction = CieloTransaction.objects.get()
        self.http_get.reset_mock()

        response = self.notify(change_type=99)

        self.assertEqual(response.status_code, 200)
        self.http_get.assert_not_called()
        notification = CieloTransactionNotification.objects.latest("pk")
        self.assertEqual(notification.change_type, 99)
        self.assertEqual(notification.transaction, transaction)

    def test_splitted_credit_card_keeps_type_and_brand(self):
        self.http_get.return_value = http_response(
            body=lookup_response(Type="SplittedCreditCard")
        )

        self.notify()

        transaction = CieloTransaction.objects.get()
        self.assertEqual(transaction.payment_type, "SplittedCreditCard")
        self.assertEqual(transaction.brand, "Visa")
        self.assertEqual(transaction.get_payment_type_display(), "Crédito")

    def test_raw_response_is_sanitized(self):
        response = lookup_response(
            DebitCard={"CardNumber": "455187******0182", "Brand": "Elo"},
            SplitPayments=[{"SubordinateMerchantId": OTHER_MERCHANT_ID}],
        )
        self.http_get.return_value = http_response(body=response)

        self.notify()

        raw_response = CieloTransaction.objects.get().raw_response
        self.assertNotIn("Customer", raw_response)
        self.assertNotIn("CreditCard", raw_response["Payment"])
        self.assertNotIn("DebitCard", raw_response["Payment"])
        self.assertEqual(raw_response["Payment"]["Brand"], "Visa")
        self.assertEqual(
            raw_response["Payment"]["SplitPayments"],
            [{"SubordinateMerchantId": OTHER_MERCHANT_ID}],
        )
        self.assertEqual(raw_response["MerchantOrderId"], "2014111701")

    def test_pix_and_boleto_have_no_brand_and_default_installments(self):
        for payment_type in ("Pix", "Boleto"):
            with self.subTest(payment_type=payment_type):
                payment_id = str(uuid4())
                self.http_get.return_value = http_response(
                    body=lookup_response(
                        payment_id,
                        Type=payment_type,
                        CreditCard=None,
                        Installments=None,
                    )
                )

                self.notify(payment_id=payment_id)

                transaction = CieloTransaction.objects.get(payment_id=payment_id)
                self.assertEqual(transaction.payment_type, payment_type)
                self.assertIsNone(transaction.brand)
                self.assertEqual(transaction.installments, 1)
                self.assertNotIn("Brand", transaction.raw_response["Payment"])

    def test_unknown_merchant_is_stored_without_seller(self):
        self.http_get.return_value = http_response(
            body=lookup_response(merchant_id=OTHER_MERCHANT_ID)
        )

        with self.assertLogs("cielo.services.transaction_notifications", "WARNING"):
            response = self.notify()

        self.assertEqual(response.status_code, 200)
        transaction = CieloTransaction.objects.get()
        self.assertIsNone(transaction.cielo_business)
        self.assertEqual(transaction.merchant_id, OTHER_MERCHANT_ID)
        self.assertEqual(transaction.lookup_status, CieloTransactionLookupStatus.SUCCESS)

    def test_unlisted_status_and_type_are_stored_unchanged(self):
        self.http_get.return_value = http_response(
            body=lookup_response(Status=99, Type="Voucher", CreditCard=None)
        )

        self.notify()

        transaction = CieloTransaction.objects.get()
        self.assertEqual(transaction.status, 99)
        self.assertEqual(transaction.payment_type, "Voucher")

    def test_notifications_cannot_be_updated_or_deleted(self):
        self.notify()
        notification = CieloTransactionNotification.objects.get()

        notification.change_type = 25
        with self.assertRaises(CieloTransactionNotificationImmutableError):
            notification.save()
        with self.assertRaises(CieloTransactionNotificationImmutableError):
            notification.delete()
        with self.assertRaises(CieloTransactionNotificationImmutableError):
            CieloTransactionNotification.objects.update(change_type=25)
        with self.assertRaises(CieloTransactionNotificationImmutableError):
            CieloTransactionNotification.objects.all().delete()
        self.assertEqual(CieloTransactionNotification.objects.get().change_type, 1)


class CieloTransactionListEndpointTests(APITestCase):
    def setUp(self):
        self.user = create_user()
        self.reseller = create_reseller(name="Revenda")
        self.store = create_reseller(BusinessType.STORE, parent=self.reseller)
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        self.client.force_authenticate(self.user)
        self.seller = create_cielo_business(
            self.reseller, merchant_id=SELLER_MERCHANT_ID
        )
        self.child_seller = create_cielo_business(
            self.store, merchant_id=OTHER_MERCHANT_ID
        )

    def create_transaction(self, seller, received_date, **changes):
        values = {
            "payment_id": str(uuid4()),
            "merchant_id": seller.merchant_id if seller else None,
            "cielo_business": seller,
            "installments": 1,
            "amount": 10000,
            "received_date": received_date,
            "payment_type": "CreditCard",
            "brand": "Visa",
            "provider": "Simulado",
            "status": 2,
            "lookup_status": CieloTransactionLookupStatus.SUCCESS,
            "last_lookup_at": timezone.now(),
        }
        values.update(changes)
        return CieloTransaction.objects.create(**values)

    def list(self, business):
        return self.client.get(f"/cielo/transactions/?business={business.pk}")

    def test_lists_only_the_selected_business_transactions_newest_first(self):
        now = timezone.now()
        older = self.create_transaction(self.seller, now - timedelta(days=2))
        newer = self.create_transaction(self.seller, now)
        same_date = self.create_transaction(self.seller, now - timedelta(days=2))
        self.create_transaction(self.child_seller, now)
        # A transaction whose only lookup failed has no seller.
        CieloTransaction.objects.create(
            payment_id=str(uuid4()),
            lookup_status=CieloTransactionLookupStatus.FAILED,
            last_lookup_at=now,
            lookup_error="HTTP 404",
        )

        response = self.list(self.reseller)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["count"], 3)
        self.assertEqual(
            [item["id"] for item in body["results"]],
            [newer.pk, same_date.pk, older.pk],
        )
        self.assertEqual(
            body["results"][0],
            {
                "id": newer.pk,
                "payment_id": newer.payment_id,
                "received_date": newer.received_date.isoformat().replace("+00:00", "Z"),
                "amount": 10000,
                "installments": 1,
                "payment_type": {"value": "CreditCard", "label": "Crédito"},
                "brand": "Visa",
                "provider": "Simulado",
                "status": {"value": 2, "label": "Pago"},
            },
        )

    def test_transaction_whose_latest_lookup_failed_is_still_listed(self):
        transaction = self.create_transaction(
            self.seller,
            timezone.now(),
            lookup_status=CieloTransactionLookupStatus.FAILED,
            lookup_error="Timeout",
        )

        response = self.list(self.reseller)

        self.assertEqual(
            [item["id"] for item in response.json()["results"]], [transaction.pk]
        )

    def test_business_scope_is_required_and_checked(self):
        outsider = create_reseller(name="Outra revenda")

        self.assertEqual(self.list(outsider).status_code, 404)
        response = self.client.get("/cielo/transactions/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("business", response.json())

    def test_business_without_seller_returns_an_empty_page(self):
        business = create_reseller(BusinessType.STORE, parent=self.reseller)
        self.create_transaction(self.seller, timezone.now())

        response = self.list(business)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 0)
        self.assertEqual(response.json()["results"], [])

    def test_unlisted_values_use_unknown_labels(self):
        self.create_transaction(
            self.seller, timezone.now(), status=99, payment_type="Voucher"
        )

        result = self.list(self.reseller).json()["results"][0]

        self.assertEqual(result["status"], {"value": 99, "label": "Desconhecido (99)"})
        self.assertEqual(
            result["payment_type"],
            {"value": "Voucher", "label": "Desconhecido (Voucher)"},
        )
