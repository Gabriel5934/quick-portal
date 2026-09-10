from django.urls import path

from quickportal.views import (
    AcquirerListView,
    BusinessDetailView,
    BusinessColorPreferenceView,
    BusinessChildrenListView,
    BusinessListCreateView,
    BusinessMembershipDetailView,
    BusinessMembershipListCreateView,
    EmailTokenObtainPairView,
    PosModelListView,
    RecurringFeeDetailView,
    RecurringFeeListCreateView,
    PosDeviceDetailView,
    PosDeviceListCreateView,
    UserRegistrationView,
)

urlpatterns = [
    path("users/register/", UserRegistrationView.as_view()),
    path("api/token/", EmailTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/acquirers/", AcquirerListView.as_view(), name="acquirer_list"),
    path("api/pos-models/", PosModelListView.as_view(), name="pos_model_list"),
    path("api/businesses/", BusinessListCreateView.as_view(), name="business_list_create"),
    path("api/businesses/<int:pk>/", BusinessDetailView.as_view(), name="business_detail"),
    path(
        "api/businesses/<int:pk>/color/",
        BusinessColorPreferenceView.as_view(),
        name="business_color_preference",
    ),
    path(
        "api/businesses/<int:owner_id>/children/",
        BusinessChildrenListView.as_view(),
        name="business_children_list",
    ),
    path(
        "api/businesses/<int:owner_id>/recurring-fees/",
        RecurringFeeListCreateView.as_view(),
        name="recurring_fee_list_create",
    ),
    path(
        "api/businesses/<int:owner_id>/recurring-fees/<int:pk>/",
        RecurringFeeDetailView.as_view(),
        name="recurring_fee_detail",
    ),
    path(
        "api/businesses/<int:business_id>/memberships/",
        BusinessMembershipListCreateView.as_view(),
        name="business_membership_list_create",
    ),
    path(
        "api/businesses/<int:business_id>/memberships/<int:pk>/",
        BusinessMembershipDetailView.as_view(),
        name="business_membership_detail",
    ),
    path("api/pos-devices/", PosDeviceListCreateView.as_view(), name="pos_device_list_create"),
    path("api/pos-devices/<int:pk>/", PosDeviceDetailView.as_view(), name="pos_device_detail"),
]
