from django.urls import path

from .views import (
    MeView,
    UserUpdateView,
    GoogleAuthCodeView,
)

urlpatterns = [
    path(
        "auth/google/",
        GoogleAuthCodeView.as_view(),
        name="google-auth",
    ),

    path(
        "me/",
        MeView.as_view(),
        name="me",
    ),

    path(
        "me/profile/update/",
        UserUpdateView.as_view(),
        name="profile-update",
    ),
]