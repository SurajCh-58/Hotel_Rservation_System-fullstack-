from django.contrib.auth.models import AbstractUser
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
        return self.username


class Profile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profiles"
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