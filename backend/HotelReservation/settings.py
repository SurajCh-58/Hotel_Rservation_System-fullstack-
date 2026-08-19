import os
from pathlib import Path
import environ
from corsheaders.defaults import default_headers

# ==============================================================================
# ENVIRONMENT & BASE DIRECTORY SETUP
# ==============================================================================

BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env()
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

# ==============================================================================
# CORE DJANGO CONFIGURATION
# ==============================================================================

SECRET_KEY = env('DJANGO_SECRET_KEY')
DEBUG = env.bool('DEBUG', default=False)
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])

ROOT_URLCONF = 'HotelReservation.urls'
WSGI_APPLICATION = 'HotelReservation.wsgi.application'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ==============================================================================
# APPLICATION DEFINITION
# ==============================================================================

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # django.contrib.sites is intentionally ABSENT.
    # SOCIALACCOUNT_PROVIDERS uses the APP dict (settings-based config),
    # so allauth reads credentials from .env — no SocialApp DB row,
    # no Sites framework, no SITE_ID needed.

    # Third-party
    'corsheaders',
    'rest_framework',
    'allauth',
    'allauth.account',
    'allauth.headless',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',

    # Local
    'profile.apps.AccountConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'allauth.account.middleware.AccountMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ==============================================================================
# AUTHENTICATION & USER MODEL
# ==============================================================================

AUTH_USER_MODEL = 'profile.User'

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ==============================================================================
# CORS & CSRF CONFIGURATION
# ==============================================================================

CORS_ALLOWED_ORIGINS = [
    'http://localhost',       # nginx frontend at port 80
    'http://localhost:5500',  # VS Code Live Server (dev)
    'http://localhost:8000',  # Django backend (admin/dev)
]

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    *default_headers,
    "x-session-token",
    "X-Session-Token",
    "x-email-verification-key",
    "x-password-reset-key",
    "x-password-reset-code",
]

CORS_EXPOSE_HEADERS = [
    "X-Session-Token",
    "x-session-token",
]

CSRF_TRUSTED_ORIGINS = [
    'http://localhost',
    'http://localhost:5500',
    'http://localhost:8000',
]

# ==============================================================================
# DJANGO ALLAUTH — Headless (65.19.x)
# ==============================================================================

ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_USER_MODEL_USERNAME_FIELD = "username"
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_PREVENT_ENUMERATION = False

# ── Signup & Email OTP ────────────────────────────────────────────────────────
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_ENABLED = True
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_MAX_ATTEMPTS = 5
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_TIMEOUT = 3600
ACCOUNT_EMAIL_VERIFICATION_SUPPORTS_RESEND = True
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = True

# ── Password Reset OTP ────────────────────────────────────────────────────────
ACCOUNT_PASSWORD_RESET_BY_CODE_ENABLED = True
ACCOUNT_PASSWORD_RESET_TOKEN_FLOW = "code"
ACCOUNT_PASSWORD_RESET_BY_CODE_MAX_ATTEMPTS = 5
ACCOUNT_PASSWORD_RESET_BY_CODE_TIMEOUT = 900
ACCOUNT_LOGIN_ON_PASSWORD_RESET = True

# ── Custom Adapters & Forms ───────────────────────────────────────────────────
ACCOUNT_ADAPTER = "profile.adapter.CustomAccountAdapter"
ACCOUNT_SIGNUP_FORM_CLASS = "profile.forms.CustomSignupForm"
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*"]

# ── Headless Frontend URLs ────────────────────────────────────────────────────
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": "http://localhost/account/verify-email/{key}",
    "account_reset_password_from_key": "http://localhost/account/password/reset/key/{key}",
}
HEADLESS_SERVE_SPECIFICATION = DEBUG

# ── Headless JWT ──────────────────────────────────────────────────────────────
HEADLESS_CLIENTS = ("app",)
HEADLESS_TOKEN_STRATEGY = "allauth.headless.tokens.strategies.jwt.JWTTokenStrategy"

HEADLESS_JWT_PRIVATE_KEY = env("ALLAUTH_JWT_PRIVATE_KEY").replace("\\n", "\n")
HEADLESS_JWT_ACCESS_TOKEN_EXPIRES_IN = 3600
HEADLESS_JWT_REFRESH_TOKEN_EXPIRES_IN = 86400 * 7
HEADLESS_JWT_ROTATE_REFRESH_TOKEN = True

# ==============================================================================
# SOCIAL ACCOUNT — Google OAuth
# ==============================================================================
#
# IMPORTANT: credentials come from .env only — never from the database.
#
# The APP dict below tells allauth to read client_id / secret from settings
# instead of looking up a SocialApp DB row. This means:
#   • No django.contrib.sites needed
#   • No SITE_ID needed
#   • No admin panel entry for Google needed
#   • Rotating credentials = update .env and restart, no DB migration
#
# The frontend sends the One Tap credential (id_token) or popup
# access_token directly to allauth's built-in endpoint:
#   POST /_allauth/app/v1/auth/provider/token
# allauth resolves the Google app from this APP dict automatically.
# ==============================================================================

SOCIALACCOUNT_ADAPTER = "profile.adapter.CustomSocialAccountAdapter"

# Google pre-verifies emails via OIDC — skip allauth's email OTP for
# social logins. Email/password users still go through "mandatory" above.
SOCIALACCOUNT_EMAIL_VERIFICATION = "none"

# Require POST to complete social login (prevents CSRF-style GET logins).
SOCIALACCOUNT_LOGIN_ON_GET = False

SOCIALACCOUNT_PROVIDERS = {
    'google': {
        # Credentials read from .env via django-environ.
        # No SocialApp DB row is created or consulted.
        'APP': {
            'client_id': env('GOOGLE_CLIENT_ID'),
            'secret':    env('GOOGLE_CLIENT_SECRET'),
            'key':       '',
        },

        # openid  → OIDC; provides the stable "sub" claim (unique user ID)
        # email   → user's email address
        # profile → name, picture
        'SCOPE': ['openid', 'profile', 'email'],

        'AUTH_PARAMS': {
            'access_type': 'online',
        },

        # Fetch extra user info (name, picture) from Google's userinfo endpoint.
        'FETCH_USERINFO': True,
        
        'OAUTH_PKCE_ENABLED': True,

        # Trust Google's email_verified claim — skip allauth's own
        # email verification step for Google sign-ins.
        'EMAIL_AUTHENTICATION': False,
    }
}

# ==============================================================================
# DJANGO REST FRAMEWORK
# ==============================================================================

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'allauth.headless.contrib.rest_framework.authentication.JWTTokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.MultiPartParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.JSONParser',
    ],
}

# ==============================================================================
# DATABASE & EMAIL
# ==============================================================================

DATABASES = {
    'default': env.db('DATABASE_URL')
}

EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')

# ==============================================================================
# INTERNATIONALIZATION & TIMEZONE
# ==============================================================================

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ==============================================================================
# STATIC & MEDIA FILES
# ==============================================================================

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# ==============================================================================
# PRODUCTION SECURITY FLAGS
# ==============================================================================

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')