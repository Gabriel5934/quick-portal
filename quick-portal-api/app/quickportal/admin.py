
from django.contrib import admin

from quickportal.models import (
    Business,
    BusinessColorPreference,
    BusinessMembership,
    PosDevice,
    RecurringFee,
    RecurringFeeTarget,
)

admin.site.register(Business)
admin.site.register(BusinessColorPreference)
admin.site.register(BusinessMembership)
admin.site.register(PosDevice)
admin.site.register(RecurringFee)
admin.site.register(RecurringFeeTarget)
