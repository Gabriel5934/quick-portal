from django.urls import path

from cielo.views import (
    CieloBankAccountTypeChoicesView,
    CieloBankChoicesView,
    CieloBusinessActivityChoicesView,
    CieloBusinessRetryView,
    CieloBusinessView,
    CieloDocumentTypeChoicesView,
)


urlpatterns = [
    path("businesses/<int:business_id>/", CieloBusinessView.as_view(), name="cielo_business"),
    path(
        "businesses/<int:business_id>/retry/",
        CieloBusinessRetryView.as_view(),
        name="cielo_business_retry",
    ),
    path(
        "options/document-types/",
        CieloDocumentTypeChoicesView.as_view(),
        name="cielo_document_types",
    ),
    path(
        "options/bank-account-types/",
        CieloBankAccountTypeChoicesView.as_view(),
        name="cielo_bank_account_types",
    ),
    path(
        "options/business-activities/",
        CieloBusinessActivityChoicesView.as_view(),
        name="cielo_business_activities",
    ),
    path("options/banks/", CieloBankChoicesView.as_view(), name="cielo_banks"),
]
