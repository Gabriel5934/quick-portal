from decimal import Decimal
from io import StringIO

from django.contrib.auth.models import User
from django.core.management import CommandError, call_command
from django.test import TestCase
from django.utils import timezone

from cielo.models import (
    CieloBankAccountStatus,
    CieloBusiness,
    CieloChangeType,
    CieloKycStatus,
    CieloOnboardingNotification,
    CieloOnboardingStatus,
    CieloPlan,
    CieloSubmissionStatus,
    cielo_plan_rate_keys,
)
from quickportal.models import Business, BusinessType


class CreateBusinessCommandTests(TestCase):
    def run_command(self, *args, **options):
        output = StringIO()
        call_command("create_business", *args, stdout=output, **options)
        return output.getvalue()

    def test_creates_a_valid_business_hierarchy(self):
        self.run_command(seed=1)
        reseller = Business.objects.get(type=BusinessType.RESELLER)

        self.run_command(reseller.id, seed=2)
        re_reseller = Business.objects.get(type=BusinessType.RE_RESELLER)

        self.run_command(re_reseller.id, seed=3)
        store = Business.objects.get(type=BusinessType.STORE)

        self.assertIsNone(reseller.parent)
        self.assertEqual(re_reseller.parent, reseller)
        self.assertEqual(store.parent, re_reseller)


class CreateAdminBusinessCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="root", email="root@email.com", password="secret"
        )

    def run_command(self, **options):
        output = StringIO()
        call_command("create_admin_business", stdout=output, **options)
        return output.getvalue()

    def test_creates_quick_digital_registered_with_cielo(self):
        self.run_command()

        business = Business.objects.get()
        self.assertEqual(business.type, BusinessType.RESELLER)
        self.assertIsNone(business.parent)
        self.assertEqual(business.name, "Quick Digital")
        self.assertEqual(business.trade_name, "Quick Digital")

        seller = CieloBusiness.objects.get(business=business)
        self.assertEqual(seller.merchant_id, "00000000-0000-0000-0000-000000000000")
        self.assertEqual(seller.status, CieloSubmissionStatus.SENT)
        self.assertEqual(seller.kyc_status, CieloKycStatus.APPROVED)
        self.assertEqual(seller.bank_account_status, CieloBankAccountStatus.SUCCESS)
        self.assertEqual(seller.onboarding_status, CieloOnboardingStatus.APPROVED)
        self.assertIsNone(seller.business_activity_id)
        self.assertEqual(seller.onboarding_notifications.count(), 4)

        plan = seller.plan
        self.assertEqual(plan.name, "Quick Plan")
        self.assertEqual(plan.description, "")
        self.assertEqual(plan.owner_business, business)
        self.assertEqual(plan.created_by, self.user)
        self.assertEqual(plan.rates.count(), len(cielo_plan_rate_keys()))
        self.assertFalse(plan.rates.exclude(mdr=0, fixed_fee=0).exists())

    def test_rerun_overwrites_conflicting_records(self):
        self.run_command()
        business = Business.objects.get()
        seller = business.cielo_business
        plan = seller.plan
        Business.objects.filter(pk=business.pk).update(
            type=BusinessType.STORE, name="Changed", email="changed@email.com"
        )
        child = Business.objects.create(
            type=BusinessType.STORE,
            parent=business,
            document_type="CPF",
            document="52839789801",
            name="Child",
            email="child@email.com",
            phone="11911111111",
        )
        other_user = User.objects.create_user(
            username="other", email="other@email.com", password="secret"
        )
        CieloPlan.objects.filter(pk=plan.pk).update(
            description="Changed", archived_at=timezone.now(), archived_by=other_user
        )
        plan.rates.update(mdr=Decimal("1.5"))
        plan.rates.first().delete()
        CieloBusiness.objects.filter(pk=seller.pk).update(
            status=CieloSubmissionStatus.FAILED,
            merchant_id="11111111-1111-1111-1111-111111111111",
            onboarding_status=CieloOnboardingStatus.BANNED,
            website="https://changed.example",
            address_city="Changed",
        )
        CieloOnboardingNotification.objects.create(
            cielo_business=seller,
            merchant_id="11111111-1111-1111-1111-111111111111",
            change_type=CieloChangeType.KYC,
            kyc_status=CieloKycStatus.REJECTED,
        )

        output = self.run_command()

        self.assertIn(f"Overwrote Quick Digital reseller #{business.id}", output)
        self.assertEqual(Business.objects.count(), 2)
        business.refresh_from_db()
        self.assertEqual(business.type, BusinessType.RESELLER)
        self.assertEqual(business.name, "Quick Digital")
        self.assertEqual(business.email, "contato@quickdigital.example")
        child.refresh_from_db()
        self.assertEqual(child.parent, business)

        self.assertEqual(CieloPlan.objects.count(), 1)
        plan.refresh_from_db()
        self.assertEqual(plan.description, "")
        self.assertIsNone(plan.archived_at)
        self.assertIsNone(plan.archived_by)
        self.assertEqual(plan.created_by, self.user)
        self.assertEqual(plan.rates.count(), len(cielo_plan_rate_keys()))
        self.assertFalse(plan.rates.exclude(mdr=0, fixed_fee=0).exists())

        self.assertEqual(CieloBusiness.objects.count(), 1)
        seller.refresh_from_db()
        self.assertEqual(seller.plan, plan)
        self.assertEqual(seller.status, CieloSubmissionStatus.SENT)
        self.assertEqual(seller.merchant_id, "00000000-0000-0000-0000-000000000000")
        self.assertEqual(seller.onboarding_status, CieloOnboardingStatus.APPROVED)
        self.assertEqual(seller.website, "")
        self.assertEqual(seller.address_city, "São Paulo")
        self.assertEqual(seller.onboarding_notifications.count(), 4)
        self.assertFalse(
            seller.onboarding_notifications.exclude(
                merchant_id="00000000-0000-0000-0000-000000000000"
            ).exists()
        )

    def test_takes_the_admin_merchant_id_from_another_seller(self):
        self.run_command()
        seller = CieloBusiness.objects.get()
        other = Business.objects.create(
            type=BusinessType.RESELLER,
            document_type="CNPJ",
            document="61805098000149",
            name="Other",
            email="other@email.com",
            phone="11922222222",
        )
        CieloBusiness.objects.filter(pk=seller.pk).update(business=other)

        self.run_command()

        self.assertIsNone(CieloBusiness.objects.get(business=other).merchant_id)
        admin_seller = CieloBusiness.objects.get(
            merchant_id="00000000-0000-0000-0000-000000000000"
        )
        self.assertEqual(admin_seller.business.document, "11222333000181")

    def test_requires_the_plan_creator(self):
        with self.assertRaisesMessage(CommandError, "User not found: missing@email.com"):
            self.run_command(user="missing@email.com")
        self.assertFalse(Business.objects.exists())
