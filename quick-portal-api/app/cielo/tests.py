import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch

import requests
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connections
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from cielo.models import (
    CieloBusiness,
    CieloNotification,
    CieloSubmissionStatus,
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
from quickportal.models import Business, BusinessType, DocumentType


VALID_MERCHANT_ID = "f88cc14d-c796-4939-957e-de4dddcb2257"
SELLER_MERCHANT_ID = "4d76b525-e66d-402e-a318-5fd3ce1af7aa"
WEBHOOK_TOKEN = "test-webhook-token"


def cielo_payload(document_type="CNPJ"):
    return {
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


def create_cielo_business(business, **changes):
    values = {
        "business": business,
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
    return CieloBusiness.objects.create(**values)


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
        self.url = f"/cielo/businesses/{self.business.pk}/"
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
        invalid = cielo_payload(document_type="CPF")
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
                response = self.client.post(self.url, cielo_payload(), format="json")
                self.assertGreaterEqual(response.status_code, 400)
                self.assertFalse(CieloBusiness.objects.exists())

        with patch(
            "cielo.views.submit_cielo_seller",
            side_effect=CieloQuickPreTransmissionError("before transmission"),
        ):
            with self.assertRaises(CieloQuickPreTransmissionError):
                self.client.post(self.url, cielo_payload(), format="json")
        self.assertFalse(CieloBusiness.objects.exists())

        with patch(
            "cielo.views.submit_cielo_seller", side_effect=RuntimeError("backend")
        ):
            with self.assertRaises(RuntimeError):
                self.client.post(self.url, cielo_payload(), format="json")
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
            response = self.client.post(self.url, cielo_payload(), format="json")

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
            response = self.client.post(self.url, cielo_payload(), format="json")

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
            response = self.client.post(self.url, cielo_payload(), format="json")

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
                cielo_payload(),
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
class CieloNotificationEndpointTests(APITestCase):
    url = "/cielo/notifications/"

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
        self.assertFalse(CieloNotification.objects.exists())
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
        self.assertEqual(CieloNotification.objects.count(), 1)

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

                notification = CieloNotification.objects.latest("pk")
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
        notification = CieloNotification.objects.get()
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
        notification = CieloNotification.objects.get()
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
        notification = CieloNotification.objects.get()
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

        self.assertEqual(CieloNotification.objects.count(), 2)
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
        with self.assertLogs("cielo.services.notifications", "ERROR"):
            response = self.notify(bank_account_notification(status=3))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(CieloNotification.objects.get().bank_account_status, 3)
        self.seller.refresh_from_db()
        self.assertIsNone(self.seller.bank_account_status)
        self.assertIsNone(self.seller.bank_account_status_updated_at)

    def test_unlisted_status_is_stored_only_on_notification(self):
        previous_update = timezone.now() - timedelta(days=1)
        CieloBusiness.objects.filter(pk=self.seller.pk).update(
            bank_account_status=2,
            bank_account_status_updated_at=previous_update,
        )
        with self.assertLogs("cielo.services.notifications", "WARNING"):
            response = self.notify(
                onboarding_notification(onboarding=1, kyc=2, bank_account=9)
            )

        self.assertEqual(response.status_code, 200)
        notification = CieloNotification.objects.get()
        self.assertEqual(notification.bank_account_status, 9)
        self.seller.refresh_from_db()
        self.assertEqual(self.seller.bank_account_status, 2)
        self.assertEqual(self.seller.bank_account_status_updated_at, previous_update)
        self.assertEqual(self.seller.kyc_status, 2)
        self.assertEqual(self.seller.onboarding_status, 1)
        self.seller.full_clean()
