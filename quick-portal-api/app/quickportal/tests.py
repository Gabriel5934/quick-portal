
import threading
from datetime import datetime, timezone
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase, TransactionTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from quickportal.models import (
    BlacklistedTokenReason,
    BlacklistReason,
    Business,
    BusinessColorPreference,
    BusinessMembership,
    BusinessRole,
    BusinessType,
    RecurringFee,
)
from quickportal.services.refresh_tokens import (
    revoke_user_tokens,
    rotate_refresh_token,
    user_transaction,
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
            {"email": new_user.email, "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.post(
            reverse("business_membership_list_create", args=[self.direct_store.id]),
            {"email": new_user.email, "role": BusinessRole.VIEWER},
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


FRONTEND_ORIGIN = "http://localhost:5173"
REFRESH_COOKIE = "refresh_token"


@override_settings(CORS_ALLOWED_ORIGINS=[FRONTEND_ORIGIN])
class RefreshTokenCookieApiTests(APITestCase):
    password = "Refresh-Test-593!"

    def setUp(self):
        self.user = User.objects.create_user(
            username="refresh-user",
            email="refresh@example.com",
            password=self.password,
        )

    @staticmethod
    def trusted_headers(**overrides):
        headers = {
            "HTTP_ORIGIN": FRONTEND_ORIGIN,
            "HTTP_X_REQUESTED_WITH": "quick-portal",
        }
        headers.update(overrides)
        return {key: value for key, value in headers.items() if value is not None}

    def login(self, **headers):
        return self.client.post(
            reverse("token_obtain_pair"),
            {"email": self.user.email, "password": self.password},
            format="json",
            **self.trusted_headers(**headers),
        )

    def refresh(self, refresh_token=None, **headers):
        if refresh_token is not None:
            self.client.cookies[REFRESH_COOKIE] = refresh_token
        return self.client.post(
            reverse("token_refresh"), format="json", **self.trusted_headers(**headers)
        )

    def logout(self, **headers):
        return self.client.post(
            reverse("token_logout"), format="json", **self.trusted_headers(**headers)
        )

    def login_token(self):
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.cookies[REFRESH_COOKIE].value

    def test_login_sets_refresh_cookie_and_returns_only_access(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {"access"})
        self.assertNotIn("refresh", response.json())
        cookie = response.cookies[REFRESH_COOKIE]
        self.assertTrue(cookie.value)
        self.assertTrue(cookie["httponly"])
        self.assertTrue(cookie["secure"])
        self.assertEqual(cookie["samesite"], "None")
        self.assertEqual(cookie["path"], "/api/token/")
        self.assertEqual(cookie["max-age"], 24 * 60 * 60)
        self.assertTrue(
            OutstandingToken.objects.filter(user=self.user, token=cookie.value).exists()
        )

    def test_login_errors_keep_the_drf_shape_and_set_no_cookie(self):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"email": self.user.email, "password": "wrong-password"},
            format="json",
            **self.trusted_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, {"password": ["Incorrect password."]})
        self.assertNotIn(REFRESH_COOKIE, response.cookies)

    def test_refresh_rotates_cookie_and_rejects_the_previous_one(self):
        old_token = self.login_token()

        response = self.refresh(old_token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {"access"})
        new_cookie = response.cookies[REFRESH_COOKIE]
        self.assertNotEqual(new_cookie.value, old_token)
        self.assertTrue(new_cookie["httponly"])
        self.assertTrue(new_cookie["secure"])
        self.assertEqual(new_cookie["samesite"], "None")
        self.assertTrue(BlacklistedToken.objects.filter(token__token=old_token).exists())

        rejected = self.refresh(old_token)
        self.assertEqual(rejected.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(rejected.data["code"], "token_not_valid")

    def test_refresh_reads_only_the_cookie(self):
        refresh_token = self.login_token()
        del self.client.cookies[REFRESH_COOKIE]

        response = self.client.post(
            reverse("token_refresh"),
            {"refresh": refresh_token},
            format="json",
            **self.trusted_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(BlacklistedToken.objects.exists())

    def test_refresh_rejects_invalid_cookie(self):
        response = self.refresh("not-a-jwt")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reuse_revokes_every_outstanding_token_of_the_user(self):
        first_session = self.login_token()
        second_session = self.login_token()
        other_user = User.objects.create_user(
            username="other-refresh-user", email="other@example.com"
        )
        other_token = str(RefreshToken.for_user(other_user))
        rotated = self.refresh(first_session).cookies[REFRESH_COOKIE].value

        reused = self.refresh(first_session)

        self.assertEqual(reused.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(
            OutstandingToken.objects.filter(
                user=self.user, blacklistedtoken__isnull=True
            ).exists()
        )
        for token in (rotated, second_session):
            with self.subTest(token="rotated" if token == rotated else "second"):
                self.assertEqual(
                    self.refresh(token).status_code, status.HTTP_401_UNAUTHORIZED
                )
        self.assertEqual(self.refresh(other_token).status_code, status.HTTP_200_OK)

    def test_logout_blacklists_and_clears_the_cookie(self):
        refresh_token = self.login_token()

        response = self.logout()

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        cleared = response.cookies[REFRESH_COOKIE]
        self.assertEqual(cleared.value, "")
        self.assertEqual(cleared["max-age"], 0)
        self.assertEqual(cleared["path"], "/api/token/")
        self.assertTrue(cleared["secure"])
        self.assertEqual(cleared["samesite"], "None")
        self.assertTrue(
            BlacklistedToken.objects.filter(token__token=refresh_token).exists()
        )
        self.assertEqual(
            self.refresh(refresh_token).status_code, status.HTTP_401_UNAUTHORIZED
        )

    def test_logout_is_idempotent_without_a_valid_cookie(self):
        for cookie_value in (None, "not-a-jwt"):
            with self.subTest(cookie=cookie_value):
                self.client.cookies.clear()
                if cookie_value is not None:
                    self.client.cookies[REFRESH_COOKIE] = cookie_value

                response = self.logout()

                self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
                self.assertEqual(response.cookies[REFRESH_COOKIE].value, "")

        refresh_token = self.login_token()
        self.assertEqual(self.logout().status_code, status.HTTP_204_NO_CONTENT)
        self.client.cookies[REFRESH_COOKIE] = refresh_token
        self.assertEqual(self.logout().status_code, status.HTTP_204_NO_CONTENT)

    def test_token_endpoints_reject_untrusted_requests(self):
        refresh_token = self.login_token()
        cases = {
            "foreign origin": {"HTTP_ORIGIN": "https://evil.example"},
            "missing origin": {"HTTP_ORIGIN": None},
            "null origin": {"HTTP_ORIGIN": "null"},
            "missing header": {"HTTP_X_REQUESTED_WITH": None},
            "wrong header": {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"},
        }
        for name, headers in cases.items():
            for endpoint in ("login", "refresh", "logout"):
                with self.subTest(case=name, endpoint=endpoint):
                    self.client.cookies[REFRESH_COOKIE] = refresh_token
                    response = getattr(self, endpoint)(**headers)

                    self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                    self.assertIn("detail", response.data)
                    self.assertNotIn(REFRESH_COOKIE, response.cookies)

        self.assertFalse(BlacklistedToken.objects.exists())
        self.assertEqual(self.refresh(refresh_token).status_code, status.HTTP_200_OK)

    def test_refresh_token_values_never_reach_the_logs(self):
        with self.assertLogs(level="DEBUG") as logs:
            first = self.login_token()
            rotated = self.refresh(first).cookies[REFRESH_COOKIE].value
            self.refresh(first)  # reuse: logs a 401 warning
            self.refresh("not-a-jwt")
            self.client.cookies[REFRESH_COOKIE] = rotated
            self.logout()

        output = "\n".join(logs.output)
        for token in (first, rotated):
            self.assertNotIn(token, output)
            # The signature part alone must not leak either.
            self.assertNotIn(token.rsplit(".", 1)[-1], output)

    def assert_session_valid(self, token):
        response = self.refresh(token)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.cookies[REFRESH_COOKIE].value

    def assert_rejected_and_cleared(self, response):
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "token_not_valid")
        self.assertEqual(response.cookies[REFRESH_COOKIE].value, "")
        self.assertEqual(response.cookies[REFRESH_COOKIE]["max-age"], 0)

    def reason_of(self, token):
        return BlacklistedTokenReason.objects.get(token__token__token=token).reason

    def test_rotation_and_logout_record_the_blacklist_reason(self):
        rotated_away = self.login_token()
        current = self.assert_session_valid(rotated_away)
        self.client.cookies[REFRESH_COOKIE] = current

        self.logout()

        self.assertEqual(self.reason_of(rotated_away), BlacklistReason.ROTATED)
        self.assertEqual(self.reason_of(current), BlacklistReason.LOGGED_OUT)

    def test_logged_out_token_is_rejected_without_revoking_other_sessions(self):
        logged_out = self.login_token()
        other_session = self.login_token()
        self.client.cookies[REFRESH_COOKIE] = logged_out
        self.logout()

        # Presenting it repeatedly never mints tokens nor revokes anything.
        for attempt in range(2):
            with self.subTest(attempt=attempt):
                response = self.refresh(logged_out)

                self.assert_rejected_and_cleared(response)
                self.assertEqual(
                    response.data["detail"], "Refresh token is invalid or expired."
                )
                self.assertEqual(
                    OutstandingToken.objects.filter(
                        user=self.user, blacklistedtoken__isnull=True
                    ).count(),
                    1,
                )

        self.assert_session_valid(other_session)

    def test_logout_after_rotation_keeps_reuse_detection(self):
        stolen = self.login_token()
        current = self.assert_session_valid(stolen)
        # A late logout presents the already rotated token.
        self.client.cookies[REFRESH_COOKIE] = stolen
        self.assertEqual(self.logout().status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.reason_of(stolen), BlacklistReason.ROTATED)

        reused = self.refresh(stolen)

        self.assert_rejected_and_cleared(reused)
        self.assertEqual(reused.data["detail"], "Refresh token was already used.")
        self.assertEqual(
            self.refresh(current).status_code, status.HTTP_401_UNAUTHORIZED
        )

    def test_revoked_token_is_rejected_without_revoking_new_sessions(self):
        first_session = self.login_token()
        revoked = self.login_token()
        self.assert_session_valid(first_session)
        self.refresh(first_session)  # reuse revokes every session
        self.assertEqual(self.reason_of(revoked), BlacklistReason.REVOKED)
        fresh_session = self.login_token()

        self.assert_rejected_and_cleared(self.refresh(revoked))

        self.assert_session_valid(fresh_session)

    def test_blacklisted_token_without_a_reason_counts_as_reuse(self):
        legacy = self.login_token()
        other_session = self.login_token()
        RefreshToken(legacy).blacklist()

        reused = self.refresh(legacy)

        self.assert_rejected_and_cleared(reused)
        self.assertEqual(reused.data["detail"], "Refresh token was already used.")
        self.assertEqual(
            self.refresh(other_session).status_code, status.HTTP_401_UNAUTHORIZED
        )


@override_settings(CORS_ALLOWED_ORIGINS=[FRONTEND_ORIGIN])
class ConcurrentRefreshTokenTests(TransactionTestCase):
    """Rotation locks the token row, so parallel requests cannot both rotate."""

    def post_in_parallel(self, token, url_names):
        """POST ``token`` as the cookie to every URL at once; return by name."""
        barrier = threading.Barrier(len(url_names))
        responses = {}

        def worker(index, url_name):
            client = APIClient()
            client.cookies[REFRESH_COOKIE] = token
            try:
                barrier.wait()
                responses[(index, url_name)] = client.post(
                    reverse(url_name),
                    format="json",
                    HTTP_ORIGIN=FRONTEND_ORIGIN,
                    HTTP_X_REQUESTED_WITH="quick-portal",
                )
            finally:
                connection.close()

        threads = [
            threading.Thread(target=worker, args=item)
            for item in enumerate(url_names)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        return responses

    def usable_tokens(self, user):
        return OutstandingToken.objects.filter(user=user, blacklistedtoken__isnull=True)

    def test_concurrent_rotation_of_one_token_is_reuse(self):
        user = User.objects.create_user(username="race", email="race@example.com")
        token = str(RefreshToken.for_user(user))

        responses = self.post_in_parallel(token, ["token_refresh", "token_refresh"])

        self.assertEqual(
            sorted(response.status_code for response in responses.values()),
            [status.HTTP_200_OK, status.HTTP_401_UNAUTHORIZED],
        )
        self.assertFalse(self.usable_tokens(user).exists())

    def test_concurrent_logout_and_rotation_never_leave_a_stale_token(self):
        user = User.objects.create_user(username="race2", email="race2@example.com")
        refresh = RefreshToken.for_user(user)
        token = str(refresh)

        responses = self.post_in_parallel(token, ["token_refresh", "token_logout"])

        self.assertEqual(
            responses[(1, "token_logout")].status_code, status.HTTP_204_NO_CONTENT
        )
        refreshed = responses[(0, "token_refresh")]
        reason = BlacklistedTokenReason.objects.get(
            token__token__jti=refresh["jti"]
        ).reason
        if refreshed.status_code == status.HTTP_200_OK:
            # Rotation won the lock; logout kept the rotation reason, and only
            # the rotated cookie is usable.
            self.assertEqual(reason, BlacklistReason.ROTATED)
            self.assertEqual(
                list(self.usable_tokens(user).values_list("token", flat=True)),
                [refreshed.cookies[REFRESH_COOKIE].value],
            )
        else:
            # Logout won the lock; rotation is rejected without minting tokens.
            self.assertEqual(refreshed.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertEqual(reason, BlacklistReason.LOGGED_OUT)
            self.assertEqual(OutstandingToken.objects.filter(user=user).count(), 1)

    def start_post(self, token, url_name, data=None):
        """POST ``data``, with ``token`` as the cookie, from a new thread.

        Returns the thread's state: its database backend ``pid`` (set before
        the request, then ``ready`` is set) and, once it finishes, ``response``.
        """
        state = {"ready": threading.Event()}

        def worker():
            client = APIClient()
            if token is not None:
                client.cookies[REFRESH_COOKIE] = token
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_backend_pid()")
                    state["pid"] = cursor.fetchone()[0]
                state["ready"].set()
                state["response"] = client.post(
                    reverse(url_name),
                    data,
                    format="json",
                    HTTP_ORIGIN=FRONTEND_ORIGIN,
                    HTTP_X_REQUESTED_WITH="quick-portal",
                )
            finally:
                connection.close()

        state["thread"] = threading.Thread(target=worker, daemon=True)
        state["thread"].start()
        return state

    def wait_until_blocked_by(self, waiter, holder, timeout=10):
        """Return whether ``waiter``'s query waits on a lock ``holder`` holds."""
        thread = waiter["thread"]
        polls = 0
        while thread.is_alive() and polls < timeout / 0.02:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT %s = ANY(pg_blocking_pids(%s))",
                    [holder["pid"], waiter["pid"]],
                )
                if cursor.fetchone()[0]:
                    return True
            thread.join(timeout=0.02)
            polls += 1
        return False

    def test_revocation_waits_for_an_in_flight_rotation(self):
        user = User.objects.create_user(username="race3", email="race3@example.com")
        replayed = str(RefreshToken.for_user(user))
        in_flight = rotate_refresh_token(replayed)["refresh"]
        rotation_paused = threading.Event()
        release_rotation = threading.Event()
        original_validate = TokenRefreshSerializer.validate

        def paused_validate(serializer, attrs):
            data = original_validate(serializer, attrs)
            # The successor token is inserted but not committed yet.
            rotation_paused.set()
            if not release_rotation.wait(timeout=30):
                raise RuntimeError("the paused rotation was never released")
            return data

        with patch.object(TokenRefreshSerializer, "validate", paused_validate):
            rotation = self.start_post(in_flight, "token_refresh")
            reuse = None
            try:
                self.assertTrue(rotation_paused.wait(timeout=30))
                reuse = self.start_post(replayed, "token_refresh")
                self.assertTrue(reuse["ready"].wait(timeout=30))

                # The reuse revocation waits on the paused rotation's lock...
                self.assertTrue(self.wait_until_blocked_by(reuse, rotation))
                reuse["thread"].join(timeout=0.2)
                self.assertTrue(reuse["thread"].is_alive())
            finally:
                release_rotation.set()
                rotation["thread"].join(timeout=30)
                if reuse is not None:
                    reuse["thread"].join(timeout=30)
            self.assertFalse(rotation["thread"].is_alive())
            self.assertFalse(reuse["thread"].is_alive())

        rotated = rotation["response"]
        self.assertEqual(rotated.status_code, status.HTTP_200_OK)
        successor = rotated.cookies[REFRESH_COOKIE].value
        reused = reuse["response"]
        self.assertEqual(reused.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(reused.data["detail"], "Refresh token was already used.")
        # ...so it also revokes the successor the rotation committed meanwhile.
        self.assertEqual(OutstandingToken.objects.filter(user=user).count(), 3)
        self.assertFalse(self.usable_tokens(user).exists())
        self.assertEqual(
            BlacklistedTokenReason.objects.get(token__token__token=successor).reason,
            BlacklistReason.REVOKED,
        )

    def test_login_waits_for_an_in_flight_revocation(self):
        password = "Race-pass-593!"
        user = User.objects.create_user(
            username="race4", email="race4@example.com", password=password
        )
        RefreshToken.for_user(user)
        revocation = {"locked": threading.Event()}
        release_revocation = threading.Event()

        def revoke():
            try:
                with user_transaction(user.pk):
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT pg_backend_pid()")
                        revocation["pid"] = cursor.fetchone()[0]
                    revocation["locked"].set()
                    if not release_revocation.wait(timeout=30):
                        raise RuntimeError("the paused revocation was never released")
                    revoke_user_tokens(user.pk)
            finally:
                connection.close()

        revocation["thread"] = threading.Thread(target=revoke, daemon=True)
        revocation["thread"].start()
        login = None
        try:
            self.assertTrue(revocation["locked"].wait(timeout=30))
            login = self.start_post(
                None,
                "token_obtain_pair",
                {"email": user.email, "password": password},
            )
            self.assertTrue(login["ready"].wait(timeout=30))

            # The login authenticates, then waits on the revocation's user lock
            # before creating its token...
            self.assertTrue(self.wait_until_blocked_by(login, revocation))
            self.assertEqual(OutstandingToken.objects.filter(user=user).count(), 1)
        finally:
            release_revocation.set()
            revocation["thread"].join(timeout=30)
            if login is not None:
                login["thread"].join(timeout=30)
        self.assertFalse(revocation["thread"].is_alive())
        self.assertFalse(login["thread"].is_alive())

        logged_in = login["response"]
        self.assertEqual(logged_in.status_code, status.HTTP_200_OK)
        # ...so it runs after the revocation committed: the old token is
        # revoked and the login's token, created afterwards, stays usable.
        self.assertEqual(
            list(self.usable_tokens(user).values_list("token", flat=True)),
            [logged_in.cookies[REFRESH_COOKIE].value],
        )
