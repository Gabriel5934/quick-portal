from io import StringIO

from django.contrib.auth.models import User
from django.core.management import CommandError, call_command
from django.test import TestCase

from cielo.models import (
    CieloBankAccountStatus,
    CieloBusiness,
    CieloKycStatus,
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

    def test_rerun_does_nothing(self):
        self.run_command()
        output = self.run_command()

        self.assertIn("nothing to do", output)
        self.assertEqual(Business.objects.count(), 1)
        self.assertEqual(CieloPlan.objects.count(), 1)
        self.assertEqual(CieloBusiness.objects.count(), 1)

    def test_requires_the_plan_creator(self):
        with self.assertRaisesMessage(CommandError, "User not found: missing@email.com"):
            self.run_command(user="missing@email.com")
        self.assertFalse(Business.objects.exists())
