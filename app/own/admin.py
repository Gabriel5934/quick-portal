from django.contrib import admin

from own.models import (
    OwnActivity,
    OwnBasket,
    OwnBusiness,
    OwnBusinessAttachment,
    OwnBusinessPartner,
    OwnFee,
    OwnPlan,
    OwnPlanFee,
    OwnPartnerAttachment,
)


admin.site.register([
    OwnBasket,
    OwnFee,
    OwnActivity,
    OwnPlan,
    OwnPlanFee,
    OwnBusiness,
    OwnBusinessPartner,
    OwnPartnerAttachment,
    OwnBusinessAttachment,
])
