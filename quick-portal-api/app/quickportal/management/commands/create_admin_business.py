from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import models, transaction
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
        "its Quick Plan, overwriting any existing Quick Digital business, Quick "
        "Plan, or Cielo seller that conflicts with them"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            default="root@email.com",
            help="Email of the user recorded as the plan's creator",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        user = get_user_model().objects.filter(email__iexact=options["user"]).first()
        if user is None:
            raise CommandError(
                f"User not found: {options['user']}. Run create_dev_user first."
            )

        # Overwrite in place so children, memberships, and other sellers on the
        # plan keep pointing at the same records.
        business = Business.objects.filter(document=ADMIN_BUSINESS["document"]).first()
        created = business is None
        if created:
            business = Business()
        business.type = BusinessType.RESELLER
        business.parent = None
        business.document_type = DocumentType.CNPJ
        for field, value in ADMIN_BUSINESS.items():
            setattr(business, field, value)
        business.full_clean()
        business.save()

        plan = CieloPlan.objects.filter(
            owner_business=business, name=ADMIN_PLAN_NAME
        ).first()
        if plan is None:
            plan = CieloPlan.objects.create(
                owner_business=business, name=ADMIN_PLAN_NAME, created_by=user
            )
        else:
            # Plans are immutable through save(), so overwrite with an update.
            CieloPlan.objects.filter(pk=plan.pk).update(
                description="", created_by=user, archived_at=None, archived_by=None
            )
            plan.refresh_from_db()
            plan.rates.all().delete()
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

        CieloBusiness.objects.filter(merchant_id=ADMIN_MERCHANT_ID).exclude(
            business=business
        ).update(merchant_id=None)
        seller = CieloBusiness.objects.filter(business=business).first()
        if seller is None:
            seller = CieloBusiness(business=business)
        else:
            # Notifications are immutable through the model and its queryset;
            # the base queryset delete replaces the seller's history.
            models.QuerySet.delete(seller.onboarding_notifications.all())
        for field in CieloBusiness._meta.concrete_fields:
            if not field.primary_key and field.name not in {
                "business",
                "created_at",
                "updated_at",
            }:
                setattr(seller, field.attname, field.get_default())

        now = timezone.now()
        seller.plan = plan
        seller.status = CieloSubmissionStatus.SENT
        seller.merchant_id = ADMIN_MERCHANT_ID
        seller.last_submitted_at = now
        seller.kyc_status = CieloKycStatus.APPROVED
        seller.kyc_status_updated_at = now
        seller.bank_account_status = CieloBankAccountStatus.SUCCESS
        seller.bank_account_status_updated_at = now
        seller.onboarding_status = CieloOnboardingStatus.APPROVED
        seller.onboarding_status_updated_at = now
        for field, value in ADMIN_SELLER.items():
            setattr(seller, field, value)
        seller.full_clean()
        seller.save()
        for values in ADMIN_NOTIFICATIONS:
            notification = CieloOnboardingNotification(
                cielo_business=seller,
                merchant_id=ADMIN_MERCHANT_ID,
                **values,
            )
            notification.full_clean()
            notification.save()

        action = "Created" if created else "Overwrote"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} Quick Digital reseller #{business.id} with Cielo merchant "
                f"{ADMIN_MERCHANT_ID} and plan #{plan.id} ({ADMIN_PLAN_NAME})."
            )
        )
