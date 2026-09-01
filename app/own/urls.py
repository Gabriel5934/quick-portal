from django.urls import path

from own.views import (
    OwnActivityListView,
    OwnFeeListView,
    OwnPlanDetailView,
    OwnPlanListCreateView,
)


urlpatterns = [
    path("activities/", OwnActivityListView.as_view(), name="own_activity_list"),
    path("fees/", OwnFeeListView.as_view(), name="own_fee_list"),
    path("plans/", OwnPlanListCreateView.as_view(), name="own_plan_list_create"),
    path("plans/<int:pk>/", OwnPlanDetailView.as_view(), name="own_plan_detail"),
]
