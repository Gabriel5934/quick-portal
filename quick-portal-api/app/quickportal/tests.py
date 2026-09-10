
from datetime import datetime, timezone

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
    RecurringFeeTarget,
)


class RecurringFeeApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="fee-admin", email="fee-admin@example.com"
        )
        self.reseller = self.make_business("Owner", BusinessType.RESELLER)
        self.re_reseller = self.make_business(
            "Child reseller", BusinessType.RE_RESELLER, self.reseller
        )
        self.direct_store = self.make_business(
            "Direct store", BusinessType.STORE, self.reseller
        )
        self.nested_store = self.make_business(
            "Nested store", BusinessType.STORE, self.re_reseller
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

    def payload(self, targets=None):
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
            "targets": [self.direct_store.id] if targets is None else targets,
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
        self.assertEqual(list(fee.targets.all()), [self.direct_store])
        self.assertEqual(response.data["created_by"], self.user.id)

    def test_rejects_grandchildren_and_store_owners(self):
        response = self.client.post(
            reverse("recurring_fee_list_create", args=[self.reseller.id]),
            self.payload([self.nested_store.id]),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("targets", response.data)

        response = self.client.get(
            reverse("recurring_fee_list_create", args=[self.direct_store.id])
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rejects_an_empty_target_list(self):
        response = self.client.post(
            reverse("recurring_fee_list_create", args=[self.reseller.id]),
            self.payload([]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("targets", response.data)

    def test_collection_endpoints_return_paginated_results(self):
        create_response = self.client.post(
            reverse("recurring_fee_list_create", args=[self.reseller.id]),
            self.payload(),
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        children_response = self.client.get(
            reverse("business_children_list", args=[self.reseller.id])
        )
        fees_response = self.client.get(
            reverse("recurring_fee_list_create", args=[self.reseller.id])
        )

        self.assertEqual(children_response.status_code, status.HTTP_200_OK)
        self.assertEqual(children_response.data["count"], 2)
        self.assertEqual(len(children_response.data["results"]), 2)
        self.assertEqual(fees_response.status_code, status.HTTP_200_OK)
        self.assertEqual(fees_response.data["count"], 1)
        self.assertEqual(len(fees_response.data["results"]), 1)

    def test_viewer_can_list_but_cannot_create(self):
        BusinessMembership.objects.filter(user=self.user).update(
            role=BusinessRole.VIEWER
        )
        list_url = reverse("recurring_fee_list_create", args=[self.reseller.id])
        self.assertEqual(self.client.get(list_url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(list_url, self.payload(), format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_update_preserves_retained_target_setup_state(self):
        create_response = self.client.post(
            reverse("recurring_fee_list_create", args=[self.reseller.id]),
            self.payload([self.direct_store.id, self.re_reseller.id]),
            format="json",
        )
        fee = RecurringFee.objects.get(pk=create_response.data["id"])
        retained_link = fee.target_links.get(target=self.direct_store)
        charged_at = datetime(2026, 9, 2, 12, tzinfo=timezone.utc)
        retained_link.setup_charged_at = charged_at
        retained_link.save(update_fields=["setup_charged_at"])

        response = self.client.patch(
            reverse("recurring_fee_detail", args=[self.reseller.id, fee.id]),
            {"targets": [self.direct_store.id], "active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        retained_link.refresh_from_db()
        self.assertEqual(retained_link.setup_charged_at, charged_at)
        self.assertFalse(
            RecurringFeeTarget.objects.filter(
                recurring_fee=fee, target=self.re_reseller
            ).exists()
        )
        self.assertEqual(
            [business["id"] for business in response.data["target_businesses"]],
            [self.direct_store.id],
        )


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

    def test_reseller_membership_scopes_list_and_counts_to_descendants(self):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        response = self.client.get(reverse("business_list_create"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 4)
        self.assertSetEqual(
            {item["id"] for item in response.data["results"]},
            {
                self.reseller.id,
                self.re_reseller.id,
                self.direct_store.id,
                self.nested_store.id,
            },
        )

    def test_business_colors_are_user_specific_and_default_to_blue(self):
        """Verify color defaults and preferences remain scoped per user.

        The ``setUp`` fixture supplies the authenticated ``self.user`` and a
        reseller hierarchy containing ``self.nested_store``. This parameterless
        test first checks the blue default, saves a purple preference, then
        authenticates another related user and confirms that user's default is
        still blue. It performs assertions and returns ``None``.
        """
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        response = self.client.get(reverse("business_list_create"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertSetEqual(
            {item["id"] for item in response.data["results"]},
            {
                self.reseller.id,
                self.re_reseller.id,
                self.direct_store.id,
                self.nested_store.id,
            },
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
            business=self.reseller,
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

    def test_business_list_can_be_filtered_to_a_business_branch(self):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )

        response = self.client.get(
            reverse("business_list_create"), {"parent": self.reseller.id}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 3)
        self.assertSetEqual(
            {item["id"] for item in response.data["results"]},
            {self.re_reseller.id, self.direct_store.id, self.nested_store.id},
        )

    def test_re_reseller_and_store_memberships_only_see_their_branches(self):
        membership = BusinessMembership.objects.create(
            user=self.user,
            business=self.re_reseller,
            role=BusinessRole.VIEWER,
        )
        response = self.client.get(reverse("business_list_create"))
        self.assertSetEqual(
            {item["id"] for item in response.data["results"]},
            {self.re_reseller.id, self.nested_store.id},
        )
        membership.business = self.direct_store
        membership.save(update_fields=["business"])
        response = self.client.get(reverse("business_list_create"))
        self.assertEqual(
            [item["id"] for item in response.data["results"]],
            [self.direct_store.id],
        )

    def test_viewer_cannot_write_and_unrelated_detail_is_hidden(self):
        BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.VIEWER
        )
        response = self.client.patch(
            reverse("business_detail", args=[self.direct_store.id]),
            {"phone": "11888888888"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.client.get(
            reverse("business_detail", args=[self.unrelated_store.id])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_overlapping_memberships_use_most_permissive_role(self):
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

    def test_admin_manages_descendant_memberships_but_not_final_root_admin(self):
        root_admin = BusinessMembership.objects.create(
            user=self.user, business=self.reseller, role=BusinessRole.ADMIN
        )
        new_user = User.objects.create_user(
            username="new-member", email="new@example.com"
        )
        response = self.client.post(
            reverse("business_membership_list_create", args=[self.direct_store.id]),
            {"user": new_user.id, "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.delete(
            reverse(
                "business_membership_detail",
                args=[self.reseller.id, root_admin.id],
            )
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

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

class EnsureDevUserCommandTests(TestCase):
    def test_creates_development_superuser(self):
        call_command("ensure_dev_user", "root@email.com", "test-password", superuser=True)
        user = User.objects.get(email="root@email.com")
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password("test-password"))

    def test_promotes_existing_user_without_creating_duplicate(self):
        user = User.objects.create_user(username="existing-root", email="ROOT@email.com")
        call_command("ensure_dev_user", "root@email.com", "test-password", superuser=True)
        user.refresh_from_db()
        self.assertEqual(User.objects.filter(email__iexact="root@email.com").count(), 1)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)

    def test_default_does_not_grant_superuser_access(self):
        call_command("ensure_dev_user", "user@email.com", "test-password")
        user = User.objects.get(email="user@email.com")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
