"""
profile/adapter.py
──────────────────
Custom allauth adapters.

Handles:
  - Username auto-generation for email-based sign-ups (AccountAdapter)
  - Username auto-generation for Google OAuth sign-ups (SocialAccountAdapter)
  - Populates AND persists full_name from Google profile data
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
        """
        Called by allauth to build the User object from Google's data
        before it is saved. Sets username and full_name on the in-memory
        user instance. The actual DB write happens in save_user() below.
        """
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

    def save_user(self, request, sociallogin, form=None):
        """
        Called by allauth after populate_user() to commit the user to the DB.

        WHY THIS OVERRIDE IS NEEDED:
        allauth's DefaultSocialAccountAdapter.save_user() calls
        account_adapter.save_user() which in turn calls
        AbstractUser.save(). Django's AbstractUser.save() only writes
        fields it knows about — it has no awareness of our custom
        `full_name` field. So even though populate_user() sets
        user.full_name correctly on the in-memory object, the value
        is silently dropped unless we explicitly write it here.

        For returning users (connect_by_email matched an existing
        account), full_name may already be set from a previous login
        or from manual profile editing, so we only update it when the
        field is currently blank to avoid overwriting user edits.
        """
        user = super().save_user(request, sociallogin, form)

        # Pull the name directly from Google's extra_data dict.
        # extra_data is populated by FETCH_USERINFO = True in settings
        # and contains the full userinfo endpoint payload.
        extra_data = sociallogin.account.extra_data or {}
        full_name = extra_data.get('name', '').strip()

        if full_name and not user.full_name:
            user.full_name = full_name
            user.save(update_fields=['full_name'])
            logger.debug("save_user → persisted full_name: %s", user.full_name)

        return user