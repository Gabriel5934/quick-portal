from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from quickportal.models import (
    Business,
    BusinessInvite,
    BusinessMembership,
    BusinessRole,
    BusinessType,
)


class BusinessInviteApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", email="admin@example.com")
        self.business = self.make_business("Store")
        self.other_business = self.make_business("Other Store")
        BusinessMembership.objects.create(
            user=self.admin, business=self.business, role=BusinessRole.ADMIN
        )
        self.client.force_authenticate(self.admin)

    @staticmethod
    def make_business(name):
        number = Business.objects.count() + 1
        return Business.objects.create(
            type=BusinessType.STORE,
            document_type="CNPJ",
            document=f"{number:014d}",
            name=name,
            email=f"business-{number}@example.com",
            phone="11999999999",
        )

    def invite_url(self, business=None):
        business = business or self.business
        return reverse("business_invite_list_create", args=[business.id])

    def test_admin_invites_registered_and_unregistered_emails(self):
        User.objects.create_user(username="known", email="Known@Example.com")

        response = self.client.post(
            self.invite_url(),
            {"email": " KNOWN@example.com ", "role": BusinessRole.MANAGER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "known@example.com")
        self.assertTrue(response.data["registered"])
        self.assertEqual(response.data["invited_by"], self.admin.id)

        response = self.client.post(
            self.invite_url(),
            {"email": "new@example.com", "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["registered"])

        response = self.client.get(self.invite_url())
        self.assertEqual(
            [(item["email"], item["registered"]) for item in response.data],
            [("known@example.com", True), ("new@example.com", False)],
        )
        self.assertFalse(BusinessMembership.objects.filter(user__username="known").exists())

    def test_rejects_duplicate_invites_and_existing_members(self):
        BusinessInvite.objects.create(
            business=self.business, email="pending@example.com", role=BusinessRole.VIEWER
        )

        response = self.client.post(
            self.invite_url(),
            {"email": "Pending@example.com", "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

        response = self.client.post(
            self.invite_url(),
            {"email": "ADMIN@example.com", "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

        # The same email may be invited to another business.
        BusinessMembership.objects.create(
            user=self.admin, business=self.other_business, role=BusinessRole.ADMIN
        )
        response = self.client.post(
            self.invite_url(self.other_business),
            {"email": "pending@example.com", "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_only_admins_manage_invites(self):
        manager = User.objects.create_user(username="manager", email="manager@example.com")
        BusinessMembership.objects.create(
            user=manager, business=self.business, role=BusinessRole.MANAGER
        )
        invite = BusinessInvite.objects.create(
            business=self.business, email="pending@example.com", role=BusinessRole.VIEWER
        )
        self.client.force_authenticate(manager)

        self.assertEqual(
            self.client.get(self.invite_url()).status_code, status.HTTP_403_FORBIDDEN
        )
        response = self.client.post(
            self.invite_url(),
            {"email": "x@example.com", "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.delete(
            reverse("business_invite_detail", args=[self.business.id, invite.id])
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.get(
            reverse("business_invite_email_status", args=[self.business.id]),
            {"email": "admin@example.com"},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Without a membership the business is not found at all.
        self.assertEqual(
            self.client.get(self.invite_url(self.other_business)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_admin_changes_role_and_revokes_invite(self):
        invite = BusinessInvite.objects.create(
            business=self.business, email="pending@example.com", role=BusinessRole.VIEWER
        )
        url = reverse("business_invite_detail", args=[self.business.id, invite.id])

        response = self.client.patch(url, {"role": BusinessRole.ADMIN}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], BusinessRole.ADMIN)

        response = self.client.patch(url, {"email": "other@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(BusinessInvite.objects.filter(pk=invite.pk).exists())

    def test_invite_from_another_business_is_not_found(self):
        invite = BusinessInvite.objects.create(
            business=self.other_business, email="pending@example.com", role=BusinessRole.VIEWER
        )
        response = self.client.delete(
            reverse("business_invite_detail", args=[self.business.id, invite.id])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_email_status_reports_registration(self):
        User.objects.create_user(username="known", email="known@example.com")
        url = reverse("business_invite_email_status", args=[self.business.id])

        response = self.client.get(url, {"email": "KNOWN@example.com"})
        self.assertEqual(response.data, {"email": "known@example.com", "registered": True})

        response = self.client.get(url, {"email": "new@example.com"})
        self.assertFalse(response.data["registered"])

        response = self.client.get(url, {"email": "not-an-email"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)


class ReceivedInviteApiTests(APITestCase):
    def setUp(self):
        self.business = Business.objects.create(
            type=BusinessType.STORE,
            document_type="CNPJ",
            document="00000000000001",
            name="Store",
            email="store@example.com",
            phone="11999999999",
        )
        self.admin = User.objects.create_user(username="admin", email="admin@example.com")
        self.invite = BusinessInvite.objects.create(
            business=self.business,
            email="invitee@example.com",
            role=BusinessRole.MANAGER,
            invited_by=self.admin,
        )
        # Invites created before sign-up are matched case-insensitively.
        self.invitee = User.objects.create_user(
            username="invitee", email="Invitee@Example.com"
        )
        self.client.force_authenticate(self.invitee)

    def test_invitee_lists_and_accepts_invite(self):
        response = self.client.get(reverse("received_invite_list"))
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["business"]["name"], "Store")
        self.assertEqual(response.data[0]["invited_by_email"], "admin@example.com")

        response = self.client.post(
            reverse("received_invite_accept", args=[self.invite.id])
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        membership = BusinessMembership.objects.get(user=self.invitee, business=self.business)
        self.assertEqual(membership.role, BusinessRole.MANAGER)
        self.assertFalse(BusinessInvite.objects.exists())

        response = self.client.get(reverse("business_list_create"))
        self.assertEqual([item["id"] for item in response.data["results"]], [self.business.id])

    def test_invitee_declines_invite(self):
        response = self.client.delete(
            reverse("received_invite_detail", args=[self.invite.id])
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(BusinessInvite.objects.exists())
        self.assertFalse(BusinessMembership.objects.exists())

    def test_other_users_cannot_see_or_accept_invite(self):
        stranger = User.objects.create_user(username="stranger", email="stranger@example.com")
        self.client.force_authenticate(stranger)

        self.assertEqual(self.client.get(reverse("received_invite_list")).data, [])
        response = self.client.post(
            reverse("received_invite_accept", args=[self.invite.id])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(BusinessMembership.objects.exists())

    def test_accepting_keeps_an_existing_membership(self):
        BusinessMembership.objects.create(
            user=self.invitee, business=self.business, role=BusinessRole.VIEWER
        )
        response = self.client.post(
            reverse("received_invite_accept", args=[self.invite.id])
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role"], BusinessRole.VIEWER)
        self.assertFalse(BusinessInvite.objects.exists())

    def test_revoking_accepted_access_removes_membership(self):
        self.client.post(reverse("received_invite_accept", args=[self.invite.id]))
        membership = BusinessMembership.objects.get(user=self.invitee)
        BusinessMembership.objects.create(
            user=self.admin, business=self.business, role=BusinessRole.ADMIN
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("business_membership_detail", args=[self.business.id, membership.id]),
            {"role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.data["role"], BusinessRole.VIEWER)

        response = self.client.delete(
            reverse("business_membership_detail", args=[self.business.id, membership.id])
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.client.force_authenticate(self.invitee)
        response = self.client.get(reverse("business_detail", args=[self.business.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
