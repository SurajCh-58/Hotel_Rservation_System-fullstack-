from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models


class User(AbstractUser):
    username = models.CharField(
        max_length=150,
        unique=True,
        blank=True,
        default=""
    )
    email = models.EmailField(unique=True)
    full_name = models.CharField(
        max_length=150,
        blank=True,
        null=True
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username", "full_name"]

    def __str__(self):
        return self.email

    def clean(self):
        super().clean()
        # Guard against empty-string username collision.
        # The adapter always generates a username, but if this model is
        # ever saved directly (shell, fixtures, tests) without one, we
        # raise early rather than letting the DB integrity error bubble up.
        if not self.username:
            raise ValidationError(
                {"username": "Username may not be empty."}
            )


class Profile(models.Model):
    # FIX #2 / #15: related_name changed from "profiles" → "profile"
    # so user.profile works everywhere (serializer, views, app.js).
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile"          # was "profiles" — caused silent UI breakage
    )
    image = models.ImageField(
        upload_to="profile/",
        blank=True,
        null=True
    )
    phone = models.CharField(
        max_length=20,
        blank=True
    )

    def __str__(self):                  # FIX #15: was missing
        return f"Profile({self.user.email})"