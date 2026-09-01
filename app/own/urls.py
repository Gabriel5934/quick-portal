from django.urls import path

from own.views import OwnFeeListView


urlpatterns = [
    path("fees/", OwnFeeListView.as_view(), name="own_fee_list"),
]
