from django.contrib.auth.models import User
from django.db import transaction
from rest_framework.exceptions import NotFound

from quickportal.models import (
    Business,
    BusinessInvite,
    BusinessMembership,
    BusinessRole,
)


def accessible_businesses(user, roles=None):
    """Return the businesses ``user`` has a direct membership on.

    Access does not cascade through the business hierarchy. Superusers can
    access every business. ``roles`` optionally limits the memberships that
    grant access.
    """
    if user.is_superuser:
        return Business.objects.all()

    memberships = user.business_memberships.all()
    if roles is not None:
        memberships = memberships.filter(role__in=roles)
    return Business.objects.filter(id__in=memberships.values("business_id"))


def get_accessible_business_or_404(user, pk, roles=None):
    try:
        return accessible_businesses(user, roles=roles).get(pk=pk)
    except (Business.DoesNotExist, TypeError, ValueError) as exc:
        raise NotFound() from exc


def effective_business_role(user, business):
    if user.is_superuser:
        return BusinessRole.ADMIN

    return (
        BusinessMembership.objects.filter(user=user, business=business)
        .values_list("role", flat=True)
        .first()
    )


def has_business_role(user, business, allowed_roles):
    return effective_business_role(user, business) in allowed_roles


def find_user_by_email(email):
    """Return the user registered with ``email``, ignoring case, or ``None``."""
    return User.objects.filter(email__iexact=email.strip()).first()


def grant_business_access(business, email, role, granted_by):
    """Grant ``role`` on ``business`` to whoever owns ``email``.

    A registered user gets a ``BusinessMembership`` right away. Otherwise a
    ``BusinessInvite`` holds the grant until someone signs up with ``email``.
    Returns the created membership or invite.
    """
    user = find_user_by_email(email)
    if user is not None:
        return BusinessMembership.objects.create(user=user, business=business, role=role)
    return BusinessInvite.objects.create(
        business=business, email=email, role=role, invited_by=granted_by
    )


def claim_business_invites(user):
    """Turn the invites sent to ``user``'s email into memberships.

    An existing membership on the same business is kept as it is.
    """
    email = (user.email or "").strip().lower()
    if not email:
        return
    with transaction.atomic():
        invites = BusinessInvite.objects.select_for_update().filter(email=email)
        for invite in invites:
            BusinessMembership.objects.get_or_create(
                user=user, business=invite.business, defaults={"role": invite.role}
            )
        invites.delete()
