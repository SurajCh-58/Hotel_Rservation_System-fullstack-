/* ============================================================
   api.js – All API calls to the HotelReservation Django backend
   ============================================================
   SIGNUP → OTP → AUTO-LOGIN FLOW
   ─────────────────────────────
   1. POST /_allauth/app/v1/auth/signup
      → 401  { data.flows: [{ id:"verify_email", is_pending:true }],
               meta.session_token: "..." }
      Frontend stores session_token, shows OTP page.

   2. POST /_allauth/app/v1/auth/email/verify  (with X-Session-Token header)
      → 200  { meta: { access_token:"<JWT>", refresh_token:"..." } }
      Frontend stores both tokens → showApp() → user is logged in.
   ============================================================ */

const BASE    = '';
const ALLAUTH = `/_allauth/app/v1`;

// ── Token helpers ───────────────────────────────────────────
const Tokens = {
  get access()       { return localStorage.getItem('access_token'); },
  get refresh()      { return localStorage.getItem('refresh_token'); },
  get sessionToken() { return sessionStorage.getItem('allauth_session_token'); },

  set(access, refresh) {
    if (access)  localStorage.setItem('access_token',  access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
  },

  setSession(token) {
    if (token) sessionStorage.setItem('allauth_session_token', token);
    else       sessionStorage.removeItem('allauth_session_token');
  },

  clear() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.removeItem('allauth_session_token');
  },

  isLoggedIn() { return !!this.access; }
};

// ── CSRF helper ─────────────────────────────────────────────
function getCsrfToken() {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith('csrftoken='))
    ?.split('=')[1] ?? '';
}

// ── Core fetch wrapper ──────────────────────────────────────
async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type':  'application/json',
    'X-CSRFToken':   getCsrfToken(),
    ...options.headers,
  };

if (Tokens.access) {
    headers['Authorization'] = `Bearer ${Tokens.access}`;
}
if (Tokens.sessionToken) {
    headers['X-Session-Token'] = Tokens.sessionToken;
}

  const res  = await fetch(url, { credentials: 'include', ...options, headers });
  let   data = null;
  try { data = await res.json(); } catch (_) {}

  // Persist the allauth session token so the OTP verify call can use it
  if (data?.meta?.session_token !== undefined) {
    Tokens.setSession(data.meta.session_token);
  }

  // Auto-refresh on 401 (skip allauth endpoints – their 401s are intentional)
  const isAllauthEndpoint = url.includes('/_allauth/');
  if (res.status === 401 && Tokens.refresh && !url.includes('token/refresh') && !isAllauthEndpoint) {
    const refreshed = await API.auth.refreshToken();
    if (refreshed.ok) {
      headers['Authorization'] = `Bearer ${Tokens.access}`;
      const retry = await fetch(url, { credentials: 'include', ...options, headers });
      let retryData = null;
      try { retryData = await retry.json(); } catch (_) {}
      return { ok: retry.ok, status: retry.status, data: retryData };
    }
  }

  return { ok: res.ok, status: res.status, data };
}

// ── API object ──────────────────────────────────────────────
const API = {

  auth: {
    // ── 1. SIGN UP ────────────────────────────────────────
    // Returns 401 + session_token when email verification is required.
    // Tokens are NOT issued here — only after OTP is verified.
    async signup({ email, password, full_name }) {
      return apiFetch(`${ALLAUTH}/auth/signup`, {
        method: 'POST',
        body:   JSON.stringify({ email, password, full_name }),
      });
    },

    // ── 2. LOGIN ──────────────────────────────────────────
    async login({ email, password }) {
      const res = await apiFetch(`${ALLAUTH}/auth/login`, {
        method: 'POST',
        body:   JSON.stringify({ email, password }),
      });
      if (res.ok) Tokens.set(res.data?.meta?.access_token, res.data?.meta?.refresh_token);
      return res;
    },

    // ── 3. VERIFY EMAIL OTP ───────────────────────────────
    // This is where JWT access_token + refresh_token are generated.
    // The X-Session-Token header (set automatically by apiFetch) links
    // this request to the pending signup/login session.
    async verifyEmail(code) {
      const res = await apiFetch(`${ALLAUTH}/auth/email/verify`, {
        method: 'POST',
        body:   JSON.stringify({ key: code }),
      });
      if (res.ok) {
        // Store both tokens → user is now authenticated
        Tokens.set(res.data?.meta?.access_token, res.data?.meta?.refresh_token);
        // Clear the temporary session token — no longer needed
        Tokens.setSession(null);
      }
      return res;
    },

    // ── 4. RESEND VERIFICATION EMAIL ──────────────────────
    // POST /_allauth/app/v1/auth/email/verify/resend
    // No request body — X-Session-Token header (sent automatically
    // by apiFetch) is all allauth needs to identify the pending session.
    async resendVerification() {
      return apiFetch(`${ALLAUTH}/auth/email/verify/resend`, {
        method: 'POST',
      });
    },

    // ── LOGOUT ────────────────────────────────────────────
    async logout() {
      const res = await apiFetch(`${ALLAUTH}/auth/logout`, { method: 'DELETE' });
      Tokens.clear();
      return res;
    },

    // ── FORGOT PASSWORD ───────────────────────────────────
    async requestPasswordReset(email) {
      return apiFetch(`${ALLAUTH}/auth/password/reset`, {
        method: 'POST',
        body:   JSON.stringify({ email }),
      });
    },

    // ── RESET PASSWORD WITH OTP ───────────────────────────
    async resetPasswordByCode({ email, code, password }) {
      return apiFetch(`${ALLAUTH}/auth/password/reset/by_code`, {
        method: 'POST',
        body:   JSON.stringify({ email, code, password }),
      });
    },

    // ── CHANGE PASSWORD (authenticated) ───────────────────
    async changePassword({ current_password, new_password }) {
      return apiFetch(`${ALLAUTH}/auth/password/change`, {
        method: 'POST',
        body:   JSON.stringify({ current_password, new_password }),
      });
    },

    // ── REFRESH JWT ───────────────────────────────────────
    async refreshToken() {
      const res = await apiFetch(`${ALLAUTH}/auth/token/refresh`, {
        method: 'POST',
        body:   JSON.stringify({ refresh: Tokens.refresh }),
      });
      if (res.ok) Tokens.set(res.data?.meta?.access_token, res.data?.meta?.refresh_token);
      return res;
    },
  },

  // ── PROFILE ──────────────────────────────────────────────
  async getMe() {
    return apiFetch(`${BASE}/api/me/`);
  },

  async getProfile() {
    return apiFetch(`${BASE}/api/me/profile/update/`);
  },

  async updateProfile(formData) {
    const headers = {};
    if (Tokens.access) headers['Authorization'] = `Bearer ${Tokens.access}`;
    const res = await fetch(`${BASE}/api/me/profile/update/`, {
      method:      'PATCH',
      credentials: 'include',
      headers,
      body:        formData,
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  },
};

// Export globals
window.API    = API;
window.Tokens = Tokens;