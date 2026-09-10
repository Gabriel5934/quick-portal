from io import StringIO

from django.core.management import call_command
from django.test import TestCase

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


class CreateRootBusinessCommandTests(TestCase):
    def test_creates_a_root_store(self):
        call_command("create_root_business", "store", seed=12, stdout=StringIO())

        business = Business.objects.get()
        self.assertEqual(business.type, BusinessType.STORE)
        self.assertIsNone(business.parent)
