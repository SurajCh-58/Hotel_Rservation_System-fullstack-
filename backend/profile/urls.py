from django.urls import path

from .views import MeView, UserUpdateView

urlpatterns = [
    # Google sign-in is handled by allauth's built-in endpoint:
    # POST /_allauth/app/v1/auth/provider/token
    # No custom view needed.
    path("me/", MeView.as_view(), name="me"),
    path("me/profile/update/", UserUpdateView.as_view(), name="profile-update"),
]