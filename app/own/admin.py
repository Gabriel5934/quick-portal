from django.contrib import admin

from own.models import OwnChannel, OwnFee, OwnMethod, OwnNetwork


admin.site.register([OwnNetwork, OwnChannel, OwnMethod, OwnFee])
