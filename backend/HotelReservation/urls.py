from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # Standard allauth browser-based URLs (used by the OAuth callback redirect)
    path('accounts/', include('allauth.urls')),

    # Allauth headless API (all /_allauth/app/v1/... endpoints)
    path('_allauth/', include('allauth.headless.urls')),

    # Our custom DRF endpoints
    path('api/', include('profile.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)