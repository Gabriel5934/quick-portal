from django.conf import settings
from rest_framework.permissions import BasePermission


class TrustedAuthOrigin(BasePermission):
    """CSRF defense for the cookie-based token endpoints.

    The refresh cookie is SameSite=None, so the browser sends it on cross-site
    requests. Requests must come from an allowed Origin and carry the custom
    header, which a cross-site form or simple request cannot set.
    """

    message = "Request origin is not allowed."

    def has_permission(self, request, view):
        origin = request.headers.get("Origin")
        if not origin or origin not in settings.CORS_ALLOWED_ORIGINS:
            self.message = "Request origin is not allowed."
            return False

        header_value = request.headers.get(settings.AUTH_CSRF_HEADER)
        if header_value != settings.AUTH_CSRF_HEADER_VALUE:
            self.message = f"Missing or invalid {settings.AUTH_CSRF_HEADER} header."
            return False
        return True
