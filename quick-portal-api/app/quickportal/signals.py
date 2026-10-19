from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from quickportal.services.business_access import claim_business_invites


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def grant_invited_access(sender, instance, **kwargs):
    """Give a saved user the access granted to their email before sign-up."""
    claim_business_invites(instance)
