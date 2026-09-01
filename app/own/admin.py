from django.contrib import admin

from own.models import (
    OwnActivity,
    OwnBasket,
    OwnChannel,
    OwnFee,
    OwnMethod,
    OwnNetwork,
    OwnPlan,
    OwnPlanFee,
)


admin.site.register([
    OwnBasket,
    OwnNetwork,
    OwnChannel,
    OwnMethod,
    OwnFee,
    OwnActivity,
    OwnPlan,
    OwnPlanFee,
])
