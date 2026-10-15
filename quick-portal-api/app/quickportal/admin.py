
from django.contrib import admin

from quickportal.models import (
    Business,
    BusinessColorPreference,
    BusinessMembership,
    RecurringFee,
)

admin.site.register(Business)
admin.site.register(BusinessColorPreference)
admin.site.register(BusinessMembership)
admin.site.register(RecurringFee)
