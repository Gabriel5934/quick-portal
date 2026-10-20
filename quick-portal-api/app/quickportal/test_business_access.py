from unittest.mock import patch

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from quickportal.models import Business, BusinessMembership, BusinessRole, BusinessType
from quickportal.serializers import BusinessMembershipWriteSerializer


class BusinessMembershipGrantTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", email="admin@example.com")
        self.business = Business.objects.create(
            type=BusinessType.STORE,
            document_type="CNPJ",
            document="00000000000001",
            name="Store",
            email="store@example.com",
            phone="11999999999",
        )
        BusinessMembership.objects.create(
            user=self.admin, business=self.business, role=BusinessRole.ADMIN
        )
        self.client.force_authenticate(self.admin)
        self.url = reverse("business_membership_list_create", args=[self.business.id])

    def test_grants_access_to_a_registered_email(self):
        known = User.objects.create_user(username="known", email="known@example.com")

        response = self.client.post(
            self.url, {"email": "KNOWN@example.com", "role": BusinessRole.MANAGER}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "known@example.com")
        self.assertEqual(response.data["role"], BusinessRole.MANAGER)
        self.assertEqual(
            BusinessMembership.objects.get(user=known, business=self.business).role,
            BusinessRole.MANAGER,
        )

        self.client.force_authenticate(known)
        response = self.client.get(reverse("business_list_create"))
        self.assertEqual(
            [item["id"] for item in response.data["results"]], [self.business.id]
        )

    def test_rejects_unregistered_and_duplicate_emails(self):
        for email, message in (
            ("nobody@example.com", "Nenhum usuário cadastrado com este e-mail."),
            ("Admin@Example.com", "Este e-mail já tem acesso a esta empresa."),
        ):
            response = self.client.post(
                self.url, {"email": email, "role": BusinessRole.VIEWER}, format="json"
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(response.data, {"email": [message]})
        self.assertEqual(BusinessMembership.objects.count(), 1)

    def test_rejects_emails_shared_by_several_users(self):
        User.objects.create_user(username="lower", email="dup@example.com")
        User.objects.create_user(username="upper", email="DUP@example.com")

        response = self.client.post(
            self.url, {"email": "dup@example.com", "role": BusinessRole.VIEWER}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data,
            {"email": ["Mais de um usuário está cadastrado com este e-mail."]},
        )
        self.assertEqual(BusinessMembership.objects.count(), 1)

    def test_concurrent_duplicate_grant_returns_validation_error(self):
        known = User.objects.create_user(username="known", email="known@example.com")
        BusinessMembership.objects.create(
            user=known, business=self.business, role=BusinessRole.VIEWER
        )

        # Simulate a grant that passed validation before the other one saved.
        def validate_without_duplicate_check(serializer, attrs):
            attrs.pop("email")
            return {**attrs, "user": known}

        with patch.object(
            BusinessMembershipWriteSerializer, "validate", validate_without_duplicate_check
        ):
            response = self.client.post(
                self.url, {"email": "known@example.com", "role": BusinessRole.MANAGER}, format="json"
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data, {"email": ["Este e-mail já tem acesso a esta empresa."]}
        )
        self.assertEqual(
            BusinessMembership.objects.get(user=known).role, BusinessRole.VIEWER
        )

    def test_only_admins_grant_access(self):
        manager = User.objects.create_user(username="manager", email="manager@example.com")
        BusinessMembership.objects.create(
            user=manager, business=self.business, role=BusinessRole.MANAGER
        )
        User.objects.create_user(username="known", email="known@example.com")
        self.client.force_authenticate(manager)

        response = self.client.post(
            self.url, {"email": "known@example.com", "role": BusinessRole.VIEWER}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_role_changes_but_user_does_not(self):
        known = User.objects.create_user(username="known", email="known@example.com")
        membership = BusinessMembership.objects.create(
            user=known, business=self.business, role=BusinessRole.VIEWER
        )
        url = reverse("business_membership_detail", args=[self.business.id, membership.id])

        response = self.client.patch(url, {"role": BusinessRole.MANAGER}, format="json")
        self.assertEqual(response.data["role"], BusinessRole.MANAGER)

        response = self.client.patch(url, {"email": "admin@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        membership.refresh_from_db()
        self.assertEqual(membership.user, known)

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(BusinessMembership.objects.filter(pk=membership.pk).exists())
