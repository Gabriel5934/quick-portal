from django.contrib import admin
from django.urls import path, include

from .views import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health, name="health"),
    path("", include("quickportal.urls")),
    path("own/", include("own.urls")),
    path("cielo/", include("cielo.urls")),
]
