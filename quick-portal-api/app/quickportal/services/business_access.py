from rest_framework.exceptions import NotFound

from quickportal.models import Business, BusinessMembership, BusinessRole


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
