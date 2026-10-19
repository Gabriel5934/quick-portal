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


class BusinessAccessApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", email="admin@example.com")
        self.business = make_business("Store")
        self.other_business = make_business("Other Store")
        self.admin_membership = BusinessMembership.objects.create(
            user=self.admin, business=self.business, role=BusinessRole.ADMIN
        )
        self.client.force_authenticate(self.admin)

    def access_url(self, business=None):
        return reverse("business_access", args=[(business or self.business).id])

    def test_registered_email_gets_access_immediately(self):
        known = User.objects.create_user(username="known", email="Known@Example.com")

        response = self.client.post(
            self.access_url(),
            {"email": " KNOWN@example.com ", "role": BusinessRole.MANAGER},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        membership = BusinessMembership.objects.get(user=known, business=self.business)
        self.assertEqual(membership.role, BusinessRole.MANAGER)
        self.assertEqual(
            response.data,
            {
                "kind": "membership",
                "id": membership.id,
                "email": "Known@example.com",
                "role": BusinessRole.MANAGER,
                "registered": True,
            },
        )
        self.assertFalse(BusinessInvite.objects.exists())

        self.client.force_authenticate(known)
        response = self.client.get(reverse("business_list_create"))
        self.assertEqual(
            [item["id"] for item in response.data["results"]], [self.business.id]
        )

    def test_unregistered_email_waits_for_sign_up(self):
        response = self.client.post(
            self.access_url(),
            {"email": "New@Example.com", "role": BusinessRole.VIEWER},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        invite = BusinessInvite.objects.get()
        self.assertEqual(invite.email, "new@example.com")
        self.assertEqual(invite.invited_by, self.admin)
        self.assertEqual(response.data["kind"], "invite")
        self.assertFalse(response.data["registered"])

        response = self.client.get(self.access_url())
        self.assertEqual(
            [(row["kind"], row["email"], row["registered"]) for row in response.data],
            [
                ("membership", "admin@example.com", True),
                ("invite", "new@example.com", False),
            ],
        )

    def test_rejects_emails_that_already_have_access(self):
        BusinessInvite.objects.create(
            business=self.business, email="pending@example.com", role=BusinessRole.VIEWER
        )

        for email in ("Pending@example.com", "ADMIN@example.com"):
            response = self.client.post(
                self.access_url(),
                {"email": email, "role": BusinessRole.VIEWER},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("email", response.data)

        # The same email may be granted access to another business.
        BusinessMembership.objects.create(
            user=self.admin, business=self.other_business, role=BusinessRole.ADMIN
        )
        response = self.client.post(
            self.access_url(self.other_business),
            {"email": "pending@example.com", "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_only_admins_manage_access(self):
        manager = User.objects.create_user(username="manager", email="manager@example.com")
        BusinessMembership.objects.create(
            user=manager, business=self.business, role=BusinessRole.MANAGER
        )
        invite = BusinessInvite.objects.create(
            business=self.business, email="pending@example.com", role=BusinessRole.VIEWER
        )
        self.client.force_authenticate(manager)

        self.assertEqual(
            self.client.get(self.access_url()).status_code, status.HTTP_403_FORBIDDEN
        )
        response = self.client.post(
            self.access_url(),
            {"email": "x@example.com", "role": BusinessRole.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.delete(
            reverse("business_invite_detail", args=[self.business.id, invite.id])
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.get(
            reverse("business_access_email_status", args=[self.business.id]),
            {"email": "admin@example.com"},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Without a membership the business is not found at all.
        self.assertEqual(
            self.client.get(self.access_url(self.other_business)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_admin_changes_role_and_revokes_pending_access(self):
        invite = BusinessInvite.objects.create(
            business=self.business, email="pending@example.com", role=BusinessRole.VIEWER
        )
        url = reverse("business_invite_detail", args=[self.business.id, invite.id])

        response = self.client.patch(url, {"role": BusinessRole.ADMIN}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], BusinessRole.ADMIN)

        # The email is read-only.
        self.client.patch(url, {"email": "other@example.com"}, format="json")
        invite.refresh_from_db()
        self.assertEqual(invite.email, "pending@example.com")

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(BusinessInvite.objects.filter(pk=invite.pk).exists())

    def test_admin_changes_role_and_revokes_granted_access(self):
        member = User.objects.create_user(username="member", email="member@example.com")
        self.client.post(
            self.access_url(),
            {"email": "member@example.com", "role": BusinessRole.VIEWER},
            format="json",
        )
        membership = BusinessMembership.objects.get(user=member)
        url = reverse("business_membership_detail", args=[self.business.id, membership.id])

        response = self.client.patch(url, {"role": BusinessRole.MANAGER}, format="json")
        self.assertEqual(response.data["role"], BusinessRole.MANAGER)

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.client.force_authenticate(member)
        response = self.client.get(reverse("business_detail", args=[self.business.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

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
        url = reverse("business_access_email_status", args=[self.business.id])

        response = self.client.get(url, {"email": "KNOWN@example.com"})
        self.assertEqual(response.data, {"email": "known@example.com", "registered": True})

        response = self.client.get(url, {"email": "new@example.com"})
        self.assertFalse(response.data["registered"])

        response = self.client.get(url, {"email": "not-an-email"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)


class InviteSignUpTests(APITestCase):
    def setUp(self):
        self.business = make_business("Store")
        self.other_business = make_business("Other Store")
        for business, role in (
            (self.business, BusinessRole.MANAGER),
            (self.other_business, BusinessRole.VIEWER),
        ):
            BusinessInvite.objects.create(
                business=business, email="invitee@example.com", role=role
            )

    def test_signing_up_grants_the_invited_access(self):
        response = self.client.post(
            "/users/register/",
            {"email": "Invitee@Example.com", "password": "a-strong-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email__iexact="invitee@example.com")
        self.assertEqual(
            dict(
                BusinessMembership.objects.filter(user=user).values_list(
                    "business_id", "role"
                )
            ),
            {
                self.business.id: BusinessRole.MANAGER,
                self.other_business.id: BusinessRole.VIEWER,
            },
        )
        self.assertFalse(BusinessInvite.objects.exists())

        self.client.force_authenticate(user)
        response = self.client.get(reverse("business_list_create"))
        self.assertEqual(response.data["count"], 2)

    def test_other_users_do_not_get_the_invited_access(self):
        User.objects.create_user(username="stranger", email="stranger@example.com")

        self.assertFalse(BusinessMembership.objects.exists())
        self.assertEqual(BusinessInvite.objects.count(), 2)

    def test_an_existing_membership_is_kept(self):
        user = User.objects.create_user(username="invitee")
        BusinessMembership.objects.create(
            user=user, business=self.business, role=BusinessRole.ADMIN
        )

        user.email = "invitee@example.com"
        user.save()

        self.assertEqual(
            BusinessMembership.objects.get(user=user, business=self.business).role,
            BusinessRole.ADMIN,
        )
        self.assertTrue(
            BusinessMembership.objects.filter(user=user, business=self.other_business).exists()
        )
        self.assertFalse(BusinessInvite.objects.exists())
