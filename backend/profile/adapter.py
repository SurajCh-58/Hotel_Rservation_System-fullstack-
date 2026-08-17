"""
profile/adapter.py
──────────────────
Custom allauth adapters.

Handles:
  - Username auto-generation for email-based sign-ups (AccountAdapter)
  - Username auto-generation for Google OAuth sign-ups (SocialAccountAdapter)
  - Populates full_name from Google profile data
"""

import logging
from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.core.internal.cryptokit import generate_user_code

logger = logging.getLogger(__name__)


class CustomAccountAdapter(DefaultAccountAdapter):

    def generate_email_verification_code(self) -> str:
        """
        Forces Signup codes to be a pure 6-digit numeric OTP
        """
        return generate_user_code(numeric=True, dashed=False, length=6)

    def generate_password_reset_code(self) -> str:
        """
        Forces Password Reset codes to be a pure 6-digit numeric OTP
        """
        return generate_user_code(numeric=True, dashed=False, length=6)

    def populate_username(self, request, user):
        if not getattr(user, 'username', None):
            email = getattr(user, 'email', '') or ''
            user.username = self.generate_unique_username(
                [email.split('@')[0], 'user']
            )
        logger.debug("populate_username → %s", user.username)

    def save_user(self, request, user, form, commit=True):
        user = super().save_user(request, user, form, commit=False)
        if commit:
            user.save()
        return user


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)

        if not getattr(user, 'username', None):
            email = data.get('email', '') or ''
            base = email.split('@')[0] or 'user'
            # Borrow generate_unique_username from the account adapter
            user.username = CustomAccountAdapter(request).generate_unique_username(
                [base, 'user']
            )
            logger.debug("populate_user → username: %s", user.username)

        full_name = data.get('name', '').strip()
        if full_name:
            user.full_name = full_name
            logger.debug("populate_user → full_name: %s", user.full_name)

        return user
