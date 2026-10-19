
from datetime import datetime, timezone
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from quickportal.models import (
    Business,
    BusinessColorPreference,
    BusinessMembership,
    BusinessRole,
    BusinessType,
    RecurringFee,
)


class RecurringFeeApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="fee-admin", email="fee-admin@example.com"
        )
        self.reseller = self.make_business("Owner", BusinessType.RESELLER)
        self.direct_store = self.make_business(
            "Direct store", BusinessType.STORE, self.reseller
        )
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )
        self.client.force_authenticate(self.user)

    @staticmethod
    def make_business(name, business_type, parent=None):
        number = Business.objects.count() + 1
        return Business.objects.create(
            type=business_type,
            parent=parent,
            document_type="CNPJ",
            document=f"{number:014d}",
            name=name,
            email=f"recurring-{number}@example.com",
            phone="11999999999",
        )

    def payload(self):
        return {
            "name": "Platform fee",
            "description": "Monthly access",
            "setup_value": "50.00",
            "pricing_mode": "GOAL",
            "fee_value": None,
            "goal_amount": "10000.00",
            "value_below_goal": "120.00",
            "value_at_or_above_goal": "80.00",
            "recurrence_unit": "MONTH",
            "recurrence_interval": 1,
            "charge_rule": "BUSINESS_DAY_OF_MONTH",
            "charge_weekday": None,
            "charge_day": None,
            "charge_month": None,
            "business_day_ordinal": 5,
            "start_date": "2026-09-01",
            "end_date": None,
            "active": True,
        }

    def test_admin_creates_owner_scoped_fee_with_server_audit_fields(self):
        response = self.client.post(
            reverse("recurring_fee_list_create", args=[self.reseller.id]),
            self.payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        fee = RecurringFee.objects.get()
        self.assertEqual(fee.owner, self.reseller)
        self.assertEqual(fee.created_by, self.user)
        self.assertEqual(response.data["created_by"], self.user.id)

    def test_store_admin_creates_its_own_fee(self):
        BusinessMembership.objects.create(
            user=self.user, business=self.direct_store, role=BusinessRole.ADMIN
        )

        response = self.client.post(
            reverse("recurring_fee_list_create", args=[self.direct_store.id]),
            self.payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(RecurringFee.objects.get().owner, self.direct_store)

    def test_parent_membership_does_not_reach_child_fees(self):
        response = self.client.get(
            reverse("recurring_fee_list_create", args=[self.direct_store.id])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_collection_endpoints_return_paginated_results(self):
        create_response = self.client.post(
            reverse("recurring_fee_list_create", args=[self.reseller.id]),
            self.payload(),
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        fees_response = self.client.get(
            reverse("recurring_fee_list_create", args=[self.reseller.id])
        )

        self.assertEqual(fees_response.status_code, status.HTTP_200_OK)
        self.assertEqual(fees_response.data["count"], 1)
        self.assertEqual(len(fees_response.data["results"]), 1)

    def test_non_admins_can_list_but_cannot_create(self):
        list_url = reverse("recurring_fee_list_create", args=[self.reseller.id])
        for role in (BusinessRole.VIEWER, BusinessRole.MANAGER):
            with self.subTest(role=role):
                BusinessMembership.objects.filter(user=self.user).update(role=role)
                self.assertEqual(
                    self.client.get(list_url).status_code, status.HTTP_200_OK
                )
                self.assertEqual(
                    self.client.post(
                        list_url, self.payload(), format="json"
                    ).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_update_preserves_charge_state(self):
        create_response = self.client.post(
            reverse("recurring_fee_list_create", args=[self.reseller.id]),
            self.payload(),
            format="json",
        )
        fee = RecurringFee.objects.get(pk=create_response.data["id"])
        charged_at = datetime(2026, 9, 2, 12, tzinfo=timezone.utc)
        fee.setup_charged_at = charged_at
        fee.save(update_fields=["setup_charged_at"])

        response = self.client.patch(
            reverse("recurring_fee_detail", args=[self.reseller.id, fee.id]),
            {"active": False, "setup_charged_at": None},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        fee.refresh_from_db()
        self.assertFalse(fee.active)
        self.assertEqual(fee.setup_charged_at, charged_at)


class BusinessHierarchyModelTests(TestCase):
    def make_business(self, name, business_type, parent=None):
        return Business(
            type=business_type,
            parent=parent,
            document_type="CPF",
            document=f"{Business.objects.count() + 1:011d}",
            name=name,
            email=f"{name.lower().replace(' ', '-')}@example.com",
            phone="11999999999",
        )

    def test_accepts_supported_hierarchy_and_root_store(self):
        reseller = self.make_business("Reseller", BusinessType.RESELLER)
        reseller.full_clean()
        reseller.save()
        re_reseller = self.make_business(
            "Re Reseller", BusinessType.RE_RESELLER, reseller
        )
        re_reseller.full_clean()
        re_reseller.save()
        for parent in (None, reseller, re_reseller):
            store = self.make_business("Store", BusinessType.STORE, parent)
            store.full_clean()

    def test_rejects_invalid_parent_type_combinations(self):
        reseller = self.make_business("Reseller", BusinessType.RESELLER)
        reseller.save()
        store = self.make_business("Store", BusinessType.STORE)
        store.save()
        invalid = [
            self.make_business("Nested reseller", BusinessType.RESELLER, reseller),
            self.make_business("Root re reseller", BusinessType.RE_RESELLER),
            self.make_business("Re reseller", BusinessType.RE_RESELLER, store),
            self.make_business("Nested store", BusinessType.STORE, store),
        ]
        for business in invalid:
            with self.subTest(name=business.name), self.assertRaises(ValidationError):
                business.full_clean()

    def test_rejects_self_parent_and_duplicate_membership(self):
        business = self.make_business("Store", BusinessType.STORE)
        business.save()
        business.parent = business
        with self.assertRaises(ValidationError):
            business.full_clean()

        user = User.objects.create_user(username="member")
        BusinessMembership.objects.create(
            user=user, business=business, role=BusinessRole.VIEWER
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            BusinessMembership.objects.create(
                user=user, business=business, role=BusinessRole.ADMIN
            )

    def test_parent_delete_is_protected_and_user_delete_cascades_membership(self):
        reseller = self.make_business("Reseller", BusinessType.RESELLER)
        reseller.full_clean()
        reseller.save()
        store = self.make_business("Store", BusinessType.STORE, reseller)
        store.full_clean()
        store.save()
        with self.assertRaises(ProtectedError):
            reseller.delete()

        user = User.objects.create_user(username="member")
        BusinessMembership.objects.create(
            user=user, business=store, role=BusinessRole.VIEWER
        )
        user.delete()
        self.assertTrue(Business.objects.filter(pk=store.pk).exists())
        self.assertFalse(BusinessMembership.objects.exists())


class BusinessAuthorizationApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tenant-user")
        self.client.force_authenticate(self.user)
        self.reseller = self.make_business("Reseller", BusinessType.RESELLER)
        self.re_reseller = self.make_business(
            "Re Reseller", BusinessType.RE_RESELLER, self.reseller
        )
        self.direct_store = self.make_business(
            "Direct Store", BusinessType.STORE, self.reseller
        )
        self.nested_store = self.make_business(
            "Nested Store", BusinessType.STORE, self.re_reseller
        )
        self.unrelated_store = self.make_business(
            "Unrelated Store", BusinessType.STORE
        )

    @staticmethod
    def make_business(name, business_type, parent=None):
        number = Business.objects.count() + 1
        business = Business(
            type=business_type,
            parent=parent,
            document_type="CNPJ",
            document=f"{number:014d}",
            name=name,
            email=f"business-{number}@example.com",
            phone="11999999999",
        )
        business.full_clean()
        business.save()
        return business

    def test_delete_business_with_children_returns_conflict(self):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )

        response = self.client.delete(
            reverse("business_detail", args=[self.reseller.id])
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            response.data["detail"],
            "The business cannot be deleted while it has child businesses.",
        )
        self.assertTrue(Business.objects.filter(pk=self.reseller.pk).exists())

    @patch("quickportal.serializers.fetch_cnpj_info")
    def test_create_rejects_a_registered_document(self, fetch_cnpj_info):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )

        response = self.client.post(
            reverse("business_list_create"),
            {
                "type": BusinessType.STORE,
                "document_type": "CNPJ",
                "document": self.unrelated_store.document,
                "email": "duplicate@example.com",
                "phone": "11999999999",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data, {"document": ["Este documento já está cadastrado."]}
        )
        fetch_cnpj_info.assert_not_called()
        self.assertEqual(
            Business.objects.filter(document=self.unrelated_store.document).count(), 1
        )

    @patch("quickportal.serializers.fetch_cnpj_info")
    def test_create_reports_a_concurrent_duplicate_as_a_field_error(
        self, fetch_cnpj_info
    ):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )
        document = "11222333000181"

        # Runs after the uniqueness check, like a request that saves first.
        def register_concurrently(_document):
            self.make_business("Concurrent", BusinessType.STORE, self.reseller)
            Business.objects.filter(name="Concurrent").update(document=document)
            return {"name": "Duplicate Ltda.", "trade_name": "Duplicate"}

        fetch_cnpj_info.side_effect = register_concurrently

        response = self.client.post(
            reverse("business_list_create"),
            {
                "type": BusinessType.STORE,
                "document_type": "CNPJ",
                "document": document,
                "email": "duplicate@example.com",
                "phone": "11999999999",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data, {"document": ["Este documento já está cadastrado."]}
        )
        self.assertEqual(Business.objects.filter(document=document).count(), 1)

    @patch("quickportal.serializers.fetch_cnpj_info")
    def test_any_user_creates_a_root_store_and_becomes_its_admin(
        self, fetch_cnpj_info
    ):
        fetch_cnpj_info.return_value = {"name": "New Ltda.", "trade_name": "New"}

        response = self.client.post(
            reverse("business_list_create"),
            {
                "type": BusinessType.STORE,
                "document_type": "CNPJ",
                "document": "11222333000181",
                "email": "new@example.com",
                "phone": "11999999999",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["type"], BusinessType.STORE)
        self.assertIsNone(response.data["parent"])
        self.assertEqual(response.data["role"], BusinessRole.ADMIN)
        self.assertTrue(
            BusinessMembership.objects.filter(
                user=self.user,
                business_id=response.data["id"],
                role=BusinessRole.ADMIN,
            ).exists()
        )

    @patch("quickportal.serializers.fetch_cnpj_info")
    def test_create_rejects_resellers_and_child_businesses(self, fetch_cnpj_info):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )
        superuser = User.objects.create_superuser(
            username="creator-super", email="creator-super@example.com", password="x"
        )
        payload = {
            "document_type": "CNPJ",
            "document": "11222333000181",
            "email": "new@example.com",
            "phone": "11999999999",
        }
        cases = {
            "reseller": {"type": BusinessType.RESELLER},
            "re-reseller": {"type": BusinessType.RE_RESELLER, "parent": self.reseller.id},
            "child store": {"type": BusinessType.STORE, "parent": self.reseller.id},
            "missing type": {},
        }
        for user in (self.user, superuser):
            self.client.force_authenticate(user)
            for case, changes in cases.items():
                with self.subTest(user=user.username, case=case):
                    response = self.client.post(
                        reverse("business_list_create"),
                        {**payload, **changes},
                        format="json",
                    )
                    self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                    self.assertIn("type", response.data)

        fetch_cnpj_info.assert_not_called()
        self.assertFalse(Business.objects.filter(document="11222333000181").exists())

    def test_create_rejects_a_non_object_body(self):
        response = self.client.post(
            reverse("business_list_create"),
            [{"type": BusinessType.STORE}],
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)

    def test_list_contains_only_direct_memberships_with_their_roles(self):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        BusinessMembership.objects.create(
            user=self.user, business=self.nested_store, role=BusinessRole.ADMIN
        )
        response = self.client.get(reverse("business_list_create"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertDictEqual(
            {item["id"]: item["role"] for item in response.data["results"]},
            {
                self.reseller.id: BusinessRole.VIEWER,
                self.nested_store.id: BusinessRole.ADMIN,
            },
        )

    def test_business_colors_are_user_specific_and_default_to_blue(self):
        """Verify color defaults and preferences remain scoped per user.

        The ``setUp`` fixture supplies the authenticated ``self.user`` and
        ``self.nested_store``. This parameterless test first checks the blue
        default, saves a purple preference, then authenticates another member
        and confirms that user's default is still blue. It performs assertions
        and returns ``None``.
        """
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        BusinessMembership.objects.create(
            user=self.user, business=self.nested_store, role=BusinessRole.VIEWER
        )
        response = self.client.get(reverse("business_list_create"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertSetEqual(
            {item["id"] for item in response.data["results"]},
            {self.reseller.id, self.nested_store.id},
        )
        self.assertTrue(
            all(item["color"] == "blue" for item in response.data["results"])
        )

        response = self.client.put(
            reverse("business_color_preference", args=[self.nested_store.id]),
            {"color": "purple"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"color": "purple"})
        self.assertTrue(
            BusinessColorPreference.objects.filter(
                user=self.user,
                business=self.nested_store,
                color="purple",
            ).exists()
        )

        other_user = User.objects.create_user(username="other-user")
        BusinessMembership.objects.create(
            user=other_user,
            business=self.nested_store,
            role=BusinessRole.VIEWER,
        )
        self.client.force_authenticate(other_user)
        response = self.client.get(
            reverse("business_detail", args=[self.nested_store.id])
        )
        self.assertEqual(response.data["color"], "blue")

    def test_business_color_rejects_invalid_color_and_inaccessible_business(self):
        """Reject invalid choices and preferences for inaccessible businesses.

        The ``setUp`` fixture provides authenticated ``self.user``, accessible
        ``self.reseller``, and inaccessible ``self.unrelated_store``. This
        parameterless test expects HTTP 400 for an invalid color and HTTP 404
        for an out-of-scope business. It performs assertions and returns
        ``None``.
        """
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        response = self.client.put(
            reverse("business_color_preference", args=[self.reseller.id]),
            {"color": "red"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.put(
            reverse("business_color_preference", args=[self.unrelated_store.id]),
            {"color": "green"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_business_color_preference_validates_on_direct_save(self):
        """Ensure direct preference persistence runs model validation.

        Using ``self.user`` and ``self.reseller`` from ``setUp``, this
        parameterless test constructs a preference with an unsupported color
        and verifies that ``save`` raises Django ``ValidationError``. It
        performs assertions and returns ``None``.
        """
        preference = BusinessColorPreference(
            user=self.user,
            business=self.reseller,
            color="red",
        )

        with self.assertRaises(ValidationError):
            preference.save()

    def test_parent_membership_does_not_reach_children(self):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )
        response = self.client.get(reverse("business_list_create"))
        self.assertEqual(
            [item["id"] for item in response.data["results"]], [self.reseller.id]
        )

        for child in (self.re_reseller, self.direct_store, self.nested_store):
            with self.subTest(child=child.name):
                response = self.client.get(reverse("business_detail", args=[child.id]))
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_viewer_cannot_write_and_unrelated_detail_is_hidden(self):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        response = self.client.patch(
            reverse("business_detail", args=[self.reseller.id]),
            {"phone": "11888888888"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.client.get(
            reverse("business_detail", args=[self.unrelated_store.id])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_role_comes_from_the_business_own_membership(self):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        BusinessMembership.objects.create(
            user=self.user, business=self.direct_store, role=BusinessRole.MANAGER
        )
        response = self.client.patch(
            reverse("business_detail", args=[self.direct_store.id]),
            {"phone": "11888888888"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.patch(
            reverse("business_detail", args=[self.reseller.id]),
            {"phone": "11888888888"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_manages_own_memberships_but_not_child_or_final_admin(self):
        admin = BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )
        new_user = User.objects.create_user(
            username="new-member", email="new@example.com"
        )
        response = self.client.post(
            reverse("business_membership_list_create", args=[self.reseller.id]),
            {"user": new_user.id, "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.post(
            reverse("business_membership_list_create", args=[self.direct_store.id]),
            {"user": new_user.id, "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        response = self.client.patch(
            reverse("business_membership_detail", args=[self.reseller.id, admin.id]),
            {"role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_cannot_revoke_own_access(self):
        admin = BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )
        other_admin = User.objects.create_user(username="other-admin")
        BusinessMembership.objects.create(
            user=other_admin, business=self.reseller, role=BusinessRole.ADMIN
        )

        response = self.client.delete(
            reverse("business_membership_detail", args=[self.reseller.id, admin.id])
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(BusinessMembership.objects.filter(pk=admin.pk).exists())

    def test_superuser_bypasses_scope_but_staff_does_not(self):
        superuser = User.objects.create_superuser(
            username="super", email="super@example.com", password="password"
        )
        self.client.force_authenticate(superuser)
        response = self.client.get(reverse("business_list_create"))
        self.assertEqual(response.data["count"], 5)

        staff = User.objects.create_user(username="staff", is_staff=True)
        self.client.force_authenticate(staff)
        response = self.client.get(reverse("business_list_create"))
        self.assertEqual(response.data["count"], 0)

class CreateDevUserCommandTests(TestCase):
    def test_creates_development_superuser(self):
        call_command("create_dev_user", "root@email.com", "test-password", superuser=True)
        user = User.objects.get(email="root@email.com")
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password("test-password"))

    def test_promotes_existing_user_without_creating_duplicate(self):
        user = User.objects.create_user(username="existing-root", email="ROOT@email.com")
        call_command("create_dev_user", "root@email.com", "test-password", superuser=True)
        user.refresh_from_db()
        self.assertEqual(User.objects.filter(email__iexact="root@email.com").count(), 1)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)

    def test_default_does_not_grant_superuser_access(self):
        call_command("create_dev_user", "user@email.com", "test-password")
        user = User.objects.get(email="user@email.com")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
