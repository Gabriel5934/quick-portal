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
    OwnPos,
    OwnPartnerAttachment,
)


admin.site.register([
    OwnBasket,
    OwnFee,
    OwnActivity,
    OwnPlan,
    OwnPlanFee,
    OwnPos,
    OwnBusiness,
    OwnBusinessPartner,
    OwnPartnerAttachment,
    OwnBusinessAttachment,
])
