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

    # Third-party apps
    'corsheaders',
    'rest_framework',
    'allauth',
    'allauth.account',
    'allauth.headless',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',

    # Local apps
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
    'http://localhost',
    'http://localhost:5500',
    'http://localhost:8000',
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
# DJANGO ALLAUTH CONFIGURATION (v65.19+ Headless App Strategy)
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
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_TIMEOUT = 3600  # seconds
ACCOUNT_EMAIL_VERIFICATION_SUPPORTS_RESEND = True
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = True

# ── Password Reset OTP ────────────────────────────────────────────────────────
ACCOUNT_PASSWORD_RESET_BY_CODE_ENABLED = True
ACCOUNT_PASSWORD_RESET_TOKEN_FLOW = "code"
ACCOUNT_PASSWORD_RESET_BY_CODE_MAX_ATTEMPTS = 5   # lock out after 5 wrong guesses
ACCOUNT_PASSWORD_RESET_BY_CODE_TIMEOUT = 900      # code expires after 15 minutes
ACCOUNT_LOGIN_ON_PASSWORD_RESET = True

# ── Custom Adapters & Forms ───────────────────────────────────────────────────
ACCOUNT_ADAPTER = "profile.adapter.CustomAccountAdapter"
ACCOUNT_SIGNUP_FORM_CLASS = "profile.forms.CustomSignupForm"
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*"]

# ── Headless Frontend URLs & Core Spec ────────────────────────────────────────
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": "http://localhost/account/verify-email/{key}",
    "account_reset_password_from_key": "http://localhost/account/password/reset/key/{key}",
}
HEADLESS_SERVE_SPECIFICATION = DEBUG

# ── Headless Client & Token Strategy (JWT) ────────────────────────────────────
HEADLESS_CLIENTS = ("app",)

HEADLESS_TOKEN_STRATEGY = (
    "allauth.headless.tokens.strategies.jwt.JWTTokenStrategy"
)

HEADLESS_JWT_PRIVATE_KEY = env("ALLAUTH_JWT_PRIVATE_KEY").replace("\\n", "\n")
HEADLESS_JWT_ACCESS_TOKEN_EXPIRES_IN = 3600
HEADLESS_JWT_REFRESH_TOKEN_EXPIRES_IN = 86400 * 7
HEADLESS_JWT_ROTATE_REFRESH_TOKEN = True

# ── Social Account Providers ──────────────────────────────────────────────────
# ==============================================================================
# ── Social Account Providers ──────────────────────────────────────────────────
# ==============================================================================

SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'APP': {
            'client_id': env('GOOGLE_CLIENT_ID'),
            'secret': env('GOOGLE_CLIENT_SECRET'),
            'key': ''
        },
        'scope': ['profile', 'email'],
        'auth_params': {
            'access_type': 'online',
            'prompt': 'select_account consent',
        },
        'fetch_userinfo': True,
    }
}

# ==============================================================================
# DJANGO REST FRAMEWORK (DRF)
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
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')