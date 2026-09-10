from django.urls import path

from own.views import (
    OwnActivityListView,
    OwnAuthTokenView,
    OwnBusinessDetailView,
    OwnBusinessSignupView,
    OwnBusinessRetryView,
    OwnBusinessReconcileView,
    OwnFeeListView,
    OwnPlanDetailView,
    OwnPlanListCreateView,
)


urlpatterns = [
    path("auth/", OwnAuthTokenView.as_view(), name="own_auth"),
    path("activities/", OwnActivityListView.as_view(), name="own_activity_list"),
    path("businesses/", OwnBusinessSignupView.as_view(), name="own_business_list_create"),
    path("businesses/<int:pk>/", OwnBusinessDetailView.as_view(), name="own_business_detail"),
    path("businesses/<int:pk>/retry/", OwnBusinessRetryView.as_view(), name="own_business_retry"),
    path("businesses/<int:pk>/reconcile/", OwnBusinessReconcileView.as_view(), name="own_business_reconcile"),
    path("fees/", OwnFeeListView.as_view(), name="own_fee_list"),
    path("plans/", OwnPlanListCreateView.as_view(), name="own_plan_list_create"),
    path("plans/<int:pk>/", OwnPlanDetailView.as_view(), name="own_plan_detail"),
]
