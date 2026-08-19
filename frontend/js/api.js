/* ============================================================
   api.js  —  HotelReservation API client
   ============================================================

   TOKEN STRATEGY
   ──────────────
   access_token   → short-lived JWT; sent as Authorization: Bearer
                    on every /api/* request.
   refresh_token  → long-lived JWT; exchanged for a new access_token
                    on 401. Cleared on logout so the Google picker is
                    always shown after sign-out (prevents auto-login to
                    the wrong account via silent token refresh).

   GOOGLE SIGN-IN  (button-click only — no auto-prompt)
   ─────────────────────────────────────────────────────
   1. User clicks "Sign in with Google".
   2. Show Google account picker via renderButton() + programmatic click.
      • renderButton() bypasses FedCM → works even when FedCM is
        disabled in Chrome site settings.
      • auto_select: true → if only one Google account is in the
        browser, the picker resolves silently (user already chose it).
   3. The GIS callback delivers an OIDC id_token (eyJ…).
   4. POST /_allauth/app/v1/auth/provider/token validates it server-side.

   LOGOUT
   ──────
   Clears ALL tokens (access + refresh + session) via Tokens.clear().
   The server-side JWT expires naturally. After logout the Google button
   always goes through Step 2 (the picker) — auto_select: true gives
   returning single-account users a one-tap experience via GIS.
   ============================================================ */


/* ============================================================
   TOKEN STORAGE
   ============================================================ */

const Tokens = {

  get access()  { return localStorage.getItem('access_token'); },
  get refresh() { return localStorage.getItem('refresh_token'); },

  get sessionToken() {
    return sessionStorage.getItem('allauth_session_token');
  },

  /** Persist access + refresh tokens (either may be absent). */
  set(access, refresh) {
    if (access)  localStorage.setItem('access_token',  access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
  },

  /** Persist (or clear) the allauth headless session token. */
  session(token) {
    if (token) {
      sessionStorage.setItem('allauth_session_token', token);
    } else {
      sessionStorage.removeItem('allauth_session_token');
    }
  },

  /**
   * HARD wipe — used when the refresh token itself is invalid/expired.
   * Forces the user back to the full Google picker on next sign-in.
   */
  clear() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.removeItem('allauth_session_token');
    sessionStorage.removeItem('password_reset_email');
    sessionStorage.removeItem('password_reset_key');
  },

  /**
   * SOFT logout — drops the access token (UI treats user as signed out)
   * but deliberately keeps the refresh token so the next explicit
   * "Sign in with Google" click can silently re-authenticate without
   * reopening the Google picker/consent screen.
   */
  clearSession() {
    localStorage.removeItem('access_token');
    sessionStorage.removeItem('allauth_session_token');
    sessionStorage.removeItem('password_reset_email');
    sessionStorage.removeItem('password_reset_key');
  },

  isLoggedIn() { return !!this.access; },
};


/* ============================================================
   HELPERS
   ============================================================ */

/** Read the CSRF token from the csrftoken cookie. */
const csrf = () =>
  document.cookie
    .split('; ')
    .find(x => x.startsWith('csrftoken='))
    ?.split('=')[1] || '';

/** Safely parse a JSON response; returns null on parse failure. */
const parseJSON = async response => {
  try   { return await response.json(); }
  catch { return null; }
};

/** Extract and persist tokens from any allauth response payload. */
const saveTokens = payload => {
  const meta = payload?.meta || {};
  const data = payload?.data || {};

  const access  = meta.access_token  ?? data.access_token  ?? payload?.access_token;
  const refresh = meta.refresh_token ?? data.refresh_token ?? payload?.refresh_token;
  const session = meta.session_token ?? data.session_token ?? payload?.session_token;

  if (access || refresh) Tokens.set(access, refresh);
  if (session !== undefined) Tokens.session(session);
};


/* ============================================================
   CORE FETCH WRAPPER
   ============================================================ */

/**
 * apiFetch — adds auth headers and handles a single 401 retry.
 *
 * opts.skipAuth         — omit Authorization header entirely
 * opts.skipSessionToken — omit X-Session-Token header
 *
 * Routing rules:
 *   • Authorization: Bearer  → only on /api/* (never on /_allauth/*)
 *   • X-Session-Token        → only on /_allauth/* (when available)
 */
async function apiFetch(url, opts = {}) {
  const { skipSessionToken = false, skipAuth = false, ...options } = opts;

  const isAllauth = url.includes('/_allauth/');

  const headers = {
    'Content-Type': 'application/json',
    'X-CSRFToken':  csrf(),
    ...(options.headers || {}),
  };

  if (!skipAuth && Tokens.access && !isAllauth) {
    headers.Authorization = `Bearer ${Tokens.access}`;
  }

  if (isAllauth && Tokens.sessionToken && !skipSessionToken) {
    headers['X-Session-Token'] = Tokens.sessionToken;
  }

  let response = await fetch(url, { credentials: 'include', ...options, headers });
  let data     = await parseJSON(response);

  // Persist any session token returned by allauth.
  if (data?.meta?.session_token !== undefined) {
    Tokens.session(data.meta.session_token);
  }

  // Single 401 retry using the refresh token (application APIs only).
  if (
    response.status === 401 &&
    Tokens.refresh &&
    !isAllauth &&
    !url.includes('/tokens/refresh') &&
    !skipAuth
  ) {
    const refreshed = await API.auth.refreshToken();

    if (refreshed.ok && Tokens.access) {
      headers.Authorization = `Bearer ${Tokens.access}`;
      response = await fetch(url, { credentials: 'include', ...options, headers });
      data     = await parseJSON(response);
    }
  }

  return { ok: response.ok, status: response.status, data };
}


/* ============================================================
   API
   ============================================================ */

const API = {

  /* ----------------------------------------------------------
     AUTH
     ---------------------------------------------------------- */
  auth: {

    /** Register a new user. Returns 200 or a pending verify_email flow. */
    signup: ({ email, password, full_name }) =>
      apiFetch(`${ALLAUTH}/auth/signup`, {
        method: 'POST',
        skipSessionToken: true,
        body: JSON.stringify({ email, password, full_name }),
      }),


    /** Email + password login. Saves tokens on success. */
    async login({ email, password }) {
      const r = await apiFetch(`${ALLAUTH}/auth/login`, {
        method: 'POST',
        skipSessionToken: true,
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) saveTokens(r.data);
      return r;
    },


    /** Verify email address with a 6-digit OTP. */
    async verifyEmail(key) {
      const r = await apiFetch(`${ALLAUTH}/auth/email/verify`, {
        method: 'POST',
        // DO NOT skipSessionToken — allauth requires X-Session-Token for the
        // stateful email-verification-by-code flow (OpenAPI spec: SessionToken param).
        // The session token was saved automatically when signup/login returned a
        // 401 with `meta.session_token`; without it allauth returns 409 (no flow pending).
        body: JSON.stringify({ key }),
      });
      if (r.ok) {
        saveTokens(r.data);
        Tokens.session(null);
      }
      return r;
    },


    /** Re-send the email verification OTP. */
    resendVerification: () =>
      apiFetch(`${ALLAUTH}/auth/email/verify/resend`, { method: 'POST' }),


    /**
     * Logout — clears ALL local tokens (access + refresh + session).
     *
     * We use Tokens.clear() (not the old soft Tokens.clearSession()).
     * The soft version kept the refresh_token so loginWithGoogleButton()
     * could silently re-auth via refreshToken() on the next click — but
     * this caused a critical bug:
     *
     *   1. User signs up with filmingreport1@gmail.com (email+password).
     *   2. User logs out.
     *   3. User clicks "Sign in with Google" (intending filmingreport@gmail.com).
     *   4. loginWithGoogleButton() sees Tokens.refresh is still set.
     *   5. It calls refreshToken() → allauth re-issues JWTs for filmingreport1.
     *   6. User is logged back into the email/password account — never saw Google.
     *
     * The refresh succeeds because it is a pure JWT exchange; allauth does not
     * care that the user intends to switch accounts. Clearing the refresh token
     * on logout forces loginWithGoogleButton() past Step 1 so it always reaches
     * Step 2 (the Google GIS picker). The picker still has auto_select: true, so
     * returning Google users with a single account get a seamless one-tap experience
     * — just via Google GIS rather than the JWT refresh path.
     *
     * We intentionally skip DELETE /_allauth/app/v1/auth/session (server-side
     * session teardown) to avoid a network round-trip; the short-lived access
     * token expires on its own.
     */
    async logout() {
      Tokens.clear();
      return { ok: true, status: 200, data: { meta: { is_authenticated: false } } };
    },


    /** Request a password-reset OTP. */
    async requestPasswordReset(email) {
      email = String(email || '').trim();
      if (!email) {
        return {
          ok: false, status: 400,
          data: { errors: [{ code: 'required', param: 'email', message: 'Email is required.' }] },
        };
      }

      const r = await apiFetch(`${ALLAUTH}/auth/password/request`, {
        method: 'POST',
        skipSessionToken: true,
        body: JSON.stringify({ email }),
      });

      const pending = r.data?.data?.flows?.some(
        f => f.id === 'password_reset_by_code' && f.is_pending,
      );

      if (r.ok || pending) {
        sessionStorage.setItem('password_reset_email', email);
      }

      return r;
    },


    /** Validate a password-reset OTP (GET with X-Password-Reset-Key). */
    verifyPasswordResetCode: key =>
      apiFetch(`${ALLAUTH}/auth/password/reset`, {
        method: 'GET',
        // DO NOT skipSessionToken — the `password_reset_by_code` flow is stateful.
        // requestPasswordReset() returns a 401 whose `meta.session_token` is saved
        // by apiFetch automatically. allauth needs that X-Session-Token to locate
        // the pending flow; without it the GET returns 409 (no flow pending).
        headers: { 'X-Password-Reset-Key': String(key || '').trim() },
      }),


    /** Submit the new password using the verified OTP key. */
    async resetPasswordByCode({ key, password }) {
      key      = String(key      || '').trim();
      password = String(password || '');

      if (!key || !password) {
        const field = key ? 'password' : 'key';
        return {
          ok: false, status: 400, passwordReset: false, authenticated: false,
          data: { errors: [{ code: 'required', param: field,
            message: `${field === 'key' ? 'Reset code' : 'Password'} is required.` }] },
        };
      }

      const r = await apiFetch(`${ALLAUTH}/auth/password/reset`, {
        method: 'POST',
        // DO NOT skipSessionToken — POST /auth/password/reset also requires
        // X-Session-Token for the code-based flow to identify the pending session.
        body: JSON.stringify({ key, password }),
      });

      if (r.status === 200 || r.status === 401) {
        saveTokens(r.data);
        sessionStorage.removeItem('password_reset_email');
        sessionStorage.removeItem('password_reset_key');
        return { ok: true, status: r.status, passwordReset: true,
          authenticated: Tokens.isLoggedIn(), data: r.data };
      }

      return { ok: false, status: r.status, passwordReset: false, authenticated: false, data: r.data };
    },


    /** Change password for an already-authenticated user. */
    changePassword: ({ current_password, new_password }) =>
      apiFetch(`${ALLAUTH}/account/password/change`, {
        method: 'POST',
        body: JSON.stringify({ current_password, new_password }),
      }),


    /* ----------------------------------------------------------
       TOKEN REFRESH  (single in-flight guard)
       ----------------------------------------------------------
       HEADLESS_JWT_ROTATE_REFRESH_TOKEN=True means refresh tokens
       are single-use. A concurrent 401 retry and a button-click
       refresh race would both send the same (now-invalid) token.
       We serialise all callers onto one outstanding promise so
       only one POST /tokens/refresh is ever in-flight at a time.
       ---------------------------------------------------------- */

    _refreshInFlight: null,

    async refreshToken() {
      if (this._refreshInFlight) return this._refreshInFlight;
      this._refreshInFlight = this._doRefreshToken();
      try     { return await this._refreshInFlight; }
      finally { this._refreshInFlight = null; }
    },

    async _doRefreshToken() {
      const refresh = Tokens.refresh;
      if (!refresh) {
        return { ok: false, status: 401, data: { detail: 'No refresh token available.' } };
      }

      const response = await fetch(`${ALLAUTH}/tokens/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify({ refresh_token: refresh }),
      });

      const data = await parseJSON(response);

      if (response.ok) {
        saveTokens(data);
      } else {
        // Token expired, already rotated, or revoked — hard wipe.
        // Next sign-in will require the full Google picker.
        Tokens.clear();
      }

      return { ok: response.ok, status: response.status, data };
    },


    /* ----------------------------------------------------------
       GOOGLE — shared id_token sender
       ----------------------------------------------------------
       Both the silent-refresh fast-path and the picker fallback
       ultimately deliver an OIDC id_token (JWT starting with eyJ…).
       allauth validates it server-side via:
         POST /_allauth/app/v1/auth/provider/token
       No custom Django view is needed.
       ---------------------------------------------------------- */

    async _sendGoogleIdToken(idToken) {
      const r = await apiFetch(`${ALLAUTH}/auth/provider/token`, {
        method: 'POST',
        skipAuth: true,
        skipSessionToken: true,
        body: JSON.stringify({
          provider: 'google',
          process:  'login',
          token: {
            client_id: window.__GOOGLE_CLIENT_ID__,
            id_token:  idToken,
          },
        }),
      });

      if (!r.ok) return r;
      saveTokens(r.data);
      return { ok: true, status: r.status, data: r.data };
    },


    /* ----------------------------------------------------------
       GOOGLE LOGIN — button-click entry point
       ----------------------------------------------------------
       Called ONLY when the user explicitly clicks "Sign in with
       Google". Never called automatically on page load.

       Flow:
         1. renderButton picker — renders Google's button into a
            hidden container and programmatically clicks it.
              • renderButton bypasses FedCM → works even when the
                user disabled FedCM via Chrome site settings.
              • auto_select: true → if only one Google account is
                signed in, the picker resolves silently (no popup).
              • use_fedcm_for_prompt: false → prevents the FedCM
                browser bar appearing alongside the popup.
              • prompt() is NOT called — it would open a second
                One Tap overlay on top of the popup.

       CANCEL DETECTION:
         When the user closes the popup without choosing an account,
         Chrome refocuses the opener window. We register a focus
         listener just before clicking the button and poll for
         CANCEL_GRACE_MS — if the GIS callback hasn't fired by
         then, the user cancelled. The grace period lets a real
         successful login win the race against the focus event.

       CONSENT SCREEN / ACCOUNT PICKER:
         These are controlled by Google, not by frontend code.
         • First sign-in: Google always shows the consent screen.
         • First sign-in: Google shows the picker if multiple
           accounts are present in the browser.
         • Second sign-in: consent is already granted → skipped.
         • Second sign-in: auto_select:true → picker skipped if
           there is only one account.
       ---------------------------------------------------------- */

    async loginWithGoogleButton() {
      const clientId = window.__GOOGLE_CLIENT_ID__;
      if (!clientId) {
        return { ok: false, status: 500, data: { detail: 'Google client ID not configured.' } };
      }
      if (!window.google?.accounts?.id) {
        return { ok: false, status: 500, data: { detail: 'Google Identity Services not loaded.' } };
      }

      // ── Google account picker via renderButton ──────────────
      // NOTE: Silent token refresh (the old Step 1) was removed because it
      // caused a wrong-account bug: after logging out of an email+password
      // account the refresh_token was still present, so clicking this button
      // would re-authenticate the email/password user instead of showing the
      // Google picker. Tokens.clear() in logout() now wipes the refresh token,
      // so we always go straight to the GIS picker. auto_select: true in the
      // initialize() call below gives returning single-account users a seamless
      // one-tap experience without needing the JWT refresh path.
      const container = document.getElementById('g-btn-container');
      if (!container) {
        return { ok: false, status: 500, data: { detail: 'Google sign-in container not found.' } };
      }

      return new Promise(resolve => {
        let settled = false;

        const safeResolve = value => {
          if (settled) return;
          settled = true;
          window.removeEventListener('focus', onWindowFocus);
          container.innerHTML = '';
          resolve(value);
        };

        // ── Cancel detection via window focus ─────────────────
        // When the user closes the Google popup without choosing
        // an account, the browser refocuses the opener window.
        // We wait CANCEL_GRACE_MS after focus returns — if the
        // GIS credential callback hasn't fired in that window,
        // the user cancelled. The grace period ensures a real
        // successful login (callback fires just after focus) wins
        // the race against an immediate cancel resolution.
        const CANCEL_GRACE_MS = 500;

        const onWindowFocus = () => {
          setTimeout(() => {
            safeResolve({
              ok:        false,
              cancelled: true,
              status:    400,
              data:      { detail: 'Google sign-in was cancelled.' },
            });
          }, CANCEL_GRACE_MS);
        };

        // ── Render Google's button into the hidden container ───
        google.accounts.id.cancel();

        google.accounts.id.initialize({
          client_id:             clientId,
          callback: async response => {
            if (settled) return;
            if (!response?.credential) {
              safeResolve({
                ok:     false,
                status: 400,
                data:   { detail: 'Google did not return a credential.' },
              });
              return;
            }
            try {
              safeResolve(await API.auth._sendGoogleIdToken(response.credential));
            } catch (err) {
              safeResolve({
                ok:     false,
                status: 500,
                data:   { detail: err.message || 'Network error during Google sign-in.' },
              });
            }
          },
          // auto_select: true → single-account browsers skip the picker.
          // The user already chose this account on first sign-in, so
          // asking again is unnecessary friction.
          auto_select:           true,
          cancel_on_tap_outside: true,
          // false → use classic popup, not the FedCM browser bar.
          // FedCM can be disabled by the user via Chrome site settings,
          // which would silently suppress the prompt. renderButton +
          // use_fedcm_for_prompt:false always shows the popup.
          use_fedcm_for_prompt:  false,
          itp_support:           true,  // Safari ITP compatibility
        });

        container.innerHTML = '';
        google.accounts.id.renderButton(container, {
          type:           'standard',
          theme:          'outline',
          size:           'large',
          logo_alignment: 'left',
        });

        // Programmatically click the rendered button.
        // This works because loginWithGoogleButton() is always
        // called from a real user click handler in app.js — the
        // browser treats this as a trusted gesture and won't
        // block the resulting popup.
        const gBtn = container.querySelector('div[role="button"], iframe');

        if (!gBtn) {
          // GIS iframe hasn't rendered yet (script still loading).
          safeResolve({
            ok:     false,
            status: 500,
            data:   { detail: 'Google button not ready. Please try again.' },
          });
          return;
        }

        // Register the focus listener just before the click so it
        // only fires when the popup closes, not before it opens.
        window.addEventListener('focus', onWindowFocus, { once: true });
        gBtn.click();

        // ── Hard timeout ───────────────────────────────────────
        // Catches the edge case where focus never returns (e.g.
        // user switches to another app and leaves the popup open).
        setTimeout(() => {
          safeResolve({
            ok:        false,
            cancelled: true,
            status:    400,
            data:      { detail: 'Google sign-in timed out.' },
          });
        }, 5 * 60 * 1000);
      });
    },

  }, // end auth


  /* ----------------------------------------------------------
     APPLICATION ENDPOINTS
     ---------------------------------------------------------- */

  /** GET /api/me/ — retrieve the authenticated user. */
  getMe: () => apiFetch(`${API_ORIGIN}/api/me/`),

  /** GET /api/me/profile/update/ — retrieve profile fields. */
  getProfile: () => apiFetch(`${API_ORIGIN}/api/me/profile/update/`),

  /** PATCH /api/me/profile/update/ — update phone + image. */
  async updateProfile(formData) {
    const headers = {};
    if (Tokens.access) headers.Authorization = `Bearer ${Tokens.access}`;

    const response = await fetch(`${API_ORIGIN}/api/me/profile/update/`, {
      method:      'PATCH',
      credentials: 'include',
      headers,
      body:        formData,
    });

    return { ok: response.ok, status: response.status, data: await parseJSON(response) };
  },

}; // end API


/* ============================================================
   CONSTANTS  (defined here so they exist before any call)
   ============================================================ */
const API_ORIGIN = window.__API_ORIGIN__ || 'http://localhost:8000';
const ALLAUTH    = `${API_ORIGIN}/_allauth/app/v1`;


/* ============================================================
   GLOBAL EXPORTS
   ============================================================ */
window.API    = API;
window.Tokens = Tokens;