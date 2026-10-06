from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from cielo.models import (
    CieloBankAccountStatus,
    CieloBankAccountType,
    CieloBusiness,
    CieloChangeType,
    CieloDocumentType,
    CieloKycStatus,
    CieloOnboardingNotification,
    CieloOnboardingStatus,
    CieloPlan,
    CieloPlanRate,
    CieloSubmissionStatus,
    cielo_plan_rate_keys,
)
from quickportal.models import Business, BusinessType, DocumentType


# Keep in sync with cielo-mock/src/scripts/seed-admin-business.ts.
ADMIN_BUSINESS = {
    "document": "11222333000181",
    "name": "Quick Digital",
    "trade_name": "Quick Digital",
    "email": "contato@quickdigital.example",
    "phone": "11900000000",
    "landline": "1130000000",
}
ADMIN_MERCHANT_ID = "00000000-0000-0000-0000-000000000000"
ADMIN_PLAN_NAME = "Quick Plan"
ADMIN_SELLER = {
    "contact_name": "Quick Digital",
    "corporate_name": "Quick Digital",
    "fancy_name": "Quick Digital",
    "bank": "341",
    "bank_account_type": CieloBankAccountType.CHECKING,
    "bank_account_number": "12345",
    "bank_account_verifier_digit": "6",
    "bank_agency_number": "1234",
    "bank_document_type": CieloDocumentType.CNPJ,
    "bank_document_number": ADMIN_BUSINESS["document"],
    "address_number": "1000",
    "address_zip_code": "01310100",
    "address_street": "Avenida Paulista",
    "address_neighborhood": "Bela Vista",
    "address_city": "São Paulo",
    "address_state": "SP",
}
# The notifications the mock's "approved" scenario sends after onboarding.
ADMIN_NOTIFICATIONS = (
    {"change_type": CieloChangeType.KYC, "kyc_status": CieloKycStatus.APPROVED},
    {
        "change_type": CieloChangeType.ONBOARDING,
        "kyc_status": CieloKycStatus.APPROVED,
        "bank_account_status": CieloBankAccountStatus.PROCESSING,
        "onboarding_status": CieloOnboardingStatus.UNDER_ANALYSIS,
    },
    {
        "change_type": CieloChangeType.BANK_ACCOUNT,
        "bank_account_status": CieloBankAccountStatus.SUCCESS,
    },
    {
        "change_type": CieloChangeType.ONBOARDING,
        "kyc_status": CieloKycStatus.APPROVED,
        "bank_account_status": CieloBankAccountStatus.SUCCESS,
        "onboarding_status": CieloOnboardingStatus.APPROVED,
    },
)


class Command(BaseCommand):
    help = (
        "Create the Quick Digital admin reseller with an approved Cielo seller and "
        "its Quick Plan; does nothing if Quick Digital already exists"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            default="root@email.com",
            help="Email of the user recorded as the plan's creator",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        existing = Business.objects.filter(document=ADMIN_BUSINESS["document"]).first()
        if existing is not None:
            self.stdout.write(
                f"Quick Digital already exists as business #{existing.id}; nothing to do."
            )
            return

        user = get_user_model().objects.filter(email__iexact=options["user"]).first()
        if user is None:
            raise CommandError(
                f"User not found: {options['user']}. Run create_dev_user first."
            )

        business = Business(
            type=BusinessType.RESELLER,
            document_type=DocumentType.CNPJ,
            **ADMIN_BUSINESS,
        )
        business.full_clean()
        business.save()

        plan = CieloPlan.objects.create(
            owner_business=business, name=ADMIN_PLAN_NAME, created_by=user
        )
        rates = [
            CieloPlanRate(
                plan=plan,
                card_brand=card_brand,
                method=method,
                installments=installments,
                mdr=Decimal("0"),
                fixed_fee=Decimal("0"),
            )
            for card_brand, method, installments in cielo_plan_rate_keys()
        ]
        for rate in rates:
            rate.full_clean(validate_unique=False, validate_constraints=False)
        CieloPlanRate.objects.bulk_create(rates)

        now = timezone.now()
        seller = CieloBusiness(
            business=business,
            plan=plan,
            status=CieloSubmissionStatus.SENT,
            merchant_id=ADMIN_MERCHANT_ID,
            last_submitted_at=now,
            kyc_status=CieloKycStatus.APPROVED,
            kyc_status_updated_at=now,
            bank_account_status=CieloBankAccountStatus.SUCCESS,
            bank_account_status_updated_at=now,
            onboarding_status=CieloOnboardingStatus.APPROVED,
            onboarding_status_updated_at=now,
            **ADMIN_SELLER,
        )
        seller.full_clean()
        seller.save()
        for notification in ADMIN_NOTIFICATIONS:
            CieloOnboardingNotification.objects.create(
                cielo_business=seller,
                merchant_id=ADMIN_MERCHANT_ID,
                **notification,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Created Quick Digital reseller #{business.id} with Cielo merchant "
                f"{ADMIN_MERCHANT_ID} and plan #{plan.id} ({ADMIN_PLAN_NAME})."
            )
        )
