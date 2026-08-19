/* ============================================================
   app.js  —  HotelReservation frontend

   AUTH FLOWS
   ──────────────────────────────────────────────────────────

   EMAIL SIGNUP
     signup → pending verify_email → OTP → verifyEmail()
     → JWT access + refresh → showApp()

   EMAIL LOGIN
     login() → ok → showApp()
            → pending verify_email → OTP screen

   GOOGLE SIGN-IN  (button-click only — NO auto-prompt on load)
     User clicks "Sign in with Google"
       → loginWithGoogleButton()
         → Step 1: silent refresh (if refresh_token exists) → showApp()
         → Step 2: Google picker popup → id_token → allauth → showApp()

   PASSWORD RESET
     requestPasswordReset(email) → 401 + pending password_reset_by_code
     → OTP → verifyPasswordResetCode() → new password
     → resetPasswordByCode()
     → 200 (logged in)  → showApp()
     → 401 (not logged in) → login screen
   ============================================================ */


/* ============================================================
   TOAST
   ============================================================ */

const Toast = {
  container: null,

  init() {
    this.container = document.getElementById('toast-container');
  },

  show(msg, type = 'info', duration = 4000) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span>${msg}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    this.container?.appendChild(el);

    if (duration > 0) {
      setTimeout(() => {
        el.classList.add('fadeOut');
        setTimeout(() => el.remove(), 250);
      }, duration);
    }
  },
};


/* ============================================================
   ROUTER
   ============================================================ */

const Router = {
  current: null,

  go(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));

    document.getElementById(`view-${viewId}`)?.classList.add('active');
    document.querySelector(`[data-view="${viewId}"]`)?.classList.add('active');

    this.current = viewId;

    const titles = {
      dashboard:         ['Dashboard',       'Welcome back!'],
      profile:           ['My Profile',      'View & manage your profile'],
      'edit-profile':    ['Edit Profile',    'Update your profile information'],
      'change-password': ['Change Password', 'Update your account password'],
      endpoints:         ['API Explorer',    'Test all backend endpoints directly'],
    };

    const [title = '', subtitle = ''] = titles[viewId] || [];
    const titleEl    = document.getElementById('topbar-title');
    const subtitleEl = document.getElementById('topbar-subtitle');
    if (titleEl)    titleEl.textContent    = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;

    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
  },

  goAuth(authView) {
    document.querySelectorAll('.auth-view').forEach(v => {
      v.style.display = 'none';
    });
    const view = document.getElementById(`auth-${authView}`);
    if (view) view.style.display = 'block';

    // Always start password-reset at phase 1 (OTP entry).
    if (authView === 'reset-password') {
      document.getElementById('reset-phase-otp').style.display      = '';
      document.getElementById('reset-phase-password').style.display = 'none';
      State.verifiedOtpCode = '';
    }
  },
};


/* ============================================================
   APPLICATION STATE
   ============================================================ */

const State = {
  user:            null,
  resetEmail:      '',
  verifiedOtpCode: '',
};


/* ============================================================
   SHELL SWITCHING
   ============================================================ */

function showApp() {
  document.getElementById('auth-shell').style.display = 'none';
  document.getElementById('app-shell').style.display  = 'flex';
  Router.go('dashboard');
  loadMe();
}

function showAuth(view = 'login') {
  document.getElementById('auth-shell').style.display = 'flex';
  document.getElementById('app-shell').style.display  = 'none';
  Router.goAuth(view);
}


/* ============================================================
   LOAD & RENDER USER
   ============================================================ */

async function loadMe() {
  const res = await API.getMe();
  if (res.ok) {
    State.user = res.data;
    renderUserInfo(res.data);
  } else if (res.status === 401) {
    Tokens.clear();
    showAuth('login');
  }
}

function renderUserInfo(user) {
  if (!user) return;

  const initials = (user.full_name || user.email || 'U').substring(0, 2).toUpperCase();
  const profile  = user.profile || {};
  const imageUrl = profile.image || null;

  const setAvatar = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = initials;
    if (imageUrl) el.innerHTML = `<img src="${imageUrl}" alt="avatar">`;
  };

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  // Sidebar
  setAvatar('mini-avatar');
  setText('mini-name',  user.full_name || '—');
  setText('mini-email', user.email     || '');

  // Dashboard hero
  setAvatar('dash-avatar');
  setText('dash-name',    user.full_name || '—');
  setText('dash-email',   user.email     || '');
  setText('dash-name-2',  user.full_name || '—');
  setText('dash-email-2', user.email     || '');
  setText('dash-phone',   profile.phone  || 'Not set');
  setText('dash-id',      `#${user.id}`);

  // Profile view
  setAvatar('profile-avatar');
  setText('profile-name',   user.full_name || '—');
  setText('profile-email',  user.email     || '');
  setText('profile-name2',  user.full_name || '—');
  setText('profile-email2', user.email     || '');
  setText('profile-phone',  profile.phone  || 'Not set');
  setText('profile-id',     `#${user.id}`);

  // Edit profile
  const editPhone = document.getElementById('edit-phone');
  if (editPhone) editPhone.value = profile.phone || '';

  const editPreview = document.getElementById('edit-avatar-preview');
  if (editPreview) {
    editPreview.textContent = initials;
    if (imageUrl) editPreview.innerHTML = `<img src="${imageUrl}" alt="avatar">`;
  }
}


/* ============================================================
   UI HELPERS
   ============================================================ */

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('btn-loading', loading);
}

function showAlert(containerId, msg, type = 'error') {
  const el = document.getElementById(containerId);
  if (!el) return;
  const icons = { error: '⚠️', success: '✅', info: 'ℹ️' };
  el.className = `alert alert-${type}`;
  el.innerHTML = `
    <span class="alert-icon">${icons[type] || icons.error}</span>
    <span>${msg}</span>
  `;
  el.style.display = 'flex';
}

function clearAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.style.display = 'none';
}

function extractError(data) {
  if (!data)                  return 'Something went wrong. Please try again.';
  if (typeof data === 'string') return data;

  if (Array.isArray(data.errors) && data.errors.length) {
    const MAP = {
      email_taken:                    'This email is already registered.',
      password_too_short:             'Password is too short (minimum 8 characters).',
      password_too_common:            'This password is too common. Choose a stronger one.',
      password_too_similar:           'Password is too similar to your email.',
      password_entirely_numeric:      'Password cannot be entirely numbers.',
      enter_email:                    'Please enter a valid email address.',
      incorrect_code:                 'The code is incorrect or has expired.',
      password_reset_key_invalid:     'The reset code is invalid or has expired.',
      password_reset_by_code_invalid: 'The reset code is invalid or has expired.',
      token_invalid:                  'The reset code is invalid or has expired.',
      invalid_password:               'The new password is invalid.',
      password_mismatch:              'Passwords do not match.',
    };
    return data.errors.map(e => {
      if (MAP[e.code]) return MAP[e.code];
      if (e.code === 'required') return `${(e.param || 'Field').replace(/_/g, ' ')} is required.`;
      if (e.code === 'invalid')  return `Invalid ${(e.param || 'input').replace(/_/g, ' ')}.`;
      return e.message || 'Unknown error.';
    }).join(' ');
  }

  if (data.detail) return data.detail;
  const values = Object.values(data).flat().filter(v => typeof v === 'string');
  return values.length ? values.join(' ') : 'Something went wrong. Please try again.';
}


/* ============================================================
   OTP INPUTS
   ============================================================ */

function setupOtpInputs(containerId) {
  const inputs = [...document.querySelectorAll(`#${containerId} .otp-input`)];

  inputs.forEach((input, i) => {
    input.addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g, '');
      e.target.value = v.slice(-1);
      if (v && i < inputs.length - 1) inputs[i + 1].focus();
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus();
    });

    input.addEventListener('paste', e => {
      e.preventDefault();
      const digits = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '');
      inputs.forEach((el, j) => { el.value = digits[j] || ''; });
      if (digits.length >= inputs.length) inputs[inputs.length - 1].focus();
    });
  });
}

function getOtpValue(containerId) {
  return [...document.querySelectorAll(`#${containerId} .otp-input`)]
    .map(el => el.value).join('');
}

function clearOtp(containerId) {
  document.querySelectorAll(`#${containerId} .otp-input`)
    .forEach(el => { el.value = ''; });
  document.querySelector(`#${containerId} .otp-input`)?.focus();
}


/* ============================================================
   SIGNUP
   ============================================================ */

document.getElementById('form-register')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('reg-alert');

  const email     = document.getElementById('reg-email').value.trim();
  const full_name = document.getElementById('reg-name').value.trim();
  const password  = document.getElementById('reg-password').value;
  const confirm   = document.getElementById('reg-confirm').value;

  if (!email)                     return showAlert('reg-alert', 'Email is required.');
  if (!full_name)                 return showAlert('reg-alert', 'Full name is required.');
  if (password !== confirm)       return showAlert('reg-alert', 'Passwords do not match.');
  if (password.length < 8)        return showAlert('reg-alert', 'Password must be at least 8 characters.');
  if (/^\d+$/.test(password))     return showAlert('reg-alert', 'Password cannot be entirely numbers.');

  setLoading('btn-register', true);
  try {
    const res = await API.auth.signup({ email, password, full_name });
    const pending = res.data?.data?.flows?.some(f => f.id === 'verify_email' && f.is_pending);

    if (res.ok || pending) {
      const hint = document.getElementById('verify-email-hint');
      if (hint) hint.textContent = email;
      Router.goAuth('verify-email');
      clearOtp('otp-verify-email');
      Toast.show('Account created! Check your email for the 6-digit verification code.', 'success', 6000);
    } else {
      showAlert('reg-alert', extractError(res.data));
    }
  } catch {
    showAlert('reg-alert', 'Unable to create account. Please try again.');
  } finally {
    setLoading('btn-register', false);
  }
});


/* ============================================================
   LOGIN
   ============================================================ */

document.getElementById('form-login')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('login-alert');

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email)    return showAlert('login-alert', 'Email is required.');
  if (!password) return showAlert('login-alert', 'Password is required.');

  setLoading('btn-login', true);
  try {
    const res = await API.auth.login({ email, password });
    const pending = res.data?.data?.flows?.some(f => f.id === 'verify_email' && f.is_pending);

    if (res.ok) {
      Toast.show('Logged in successfully!', 'success');
      showApp();
    } else if (pending) {
      const hint = document.getElementById('verify-email-hint');
      if (hint) hint.textContent = email;
      Router.goAuth('verify-email');
      clearOtp('otp-verify-email');
      Toast.show('Please verify your email first.', 'info');
    } else {
      showAlert('login-alert', extractError(res.data));
    }
  } catch {
    showAlert('login-alert', 'Unable to log in. Please try again.');
  } finally {
    setLoading('btn-login', false);
  }
});


/* ============================================================
   EMAIL VERIFICATION
   ============================================================ */

document.getElementById('btn-verify-email')?.addEventListener('click', async () => {
  clearAlert('verify-alert');

  const code = getOtpValue('otp-verify-email').trim();
  if (code.length !== 6) return showAlert('verify-alert', 'Please enter the full 6-digit code.');

  setLoading('btn-verify-email', true);
  try {
    const res = await API.auth.verifyEmail(code);
    if (res.ok) {
      Toast.show('Email verified! You are now logged in. 🎉', 'success');
      showApp();
    } else {
      clearOtp('otp-verify-email');
      showAlert('verify-alert', extractError(res.data));
    }
  } finally {
    setLoading('btn-verify-email', false);
  }
});


/* ============================================================
   RESEND EMAIL VERIFICATION
   ============================================================ */

document.getElementById('btn-resend-verify')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-resend-verify');
  if (!btn) return;
  btn.disabled = true;

  try {
    const res = await API.auth.resendVerification();
    if (res.ok) {
      Toast.show('Verification code resent! Check your inbox.', 'success');
      let seconds = 30;
      const original = btn.textContent;
      btn.textContent = `Resend in ${seconds}s`;
      const interval = setInterval(() => {
        seconds--;
        btn.textContent = `Resend in ${seconds}s`;
        if (seconds <= 0) {
          clearInterval(interval);
          btn.textContent = original;
          btn.disabled    = false;
        }
      }, 1000);
    } else {
      Toast.show(extractError(res.data), 'error');
      btn.disabled = false;
    }
  } catch {
    Toast.show('Unable to resend verification code.', 'error');
    btn.disabled = false;
  }
});


/* ============================================================
   FORGOT PASSWORD
   ============================================================ */

document.getElementById('form-forgot')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('forgot-alert');

  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return showAlert('forgot-alert', 'Please enter your email address.');

  setLoading('btn-forgot', true);
  try {
    const res     = await API.auth.requestPasswordReset(email);
    const pending = res.data?.data?.flows?.some(
      f => f.id === 'password_reset_by_code' && f.is_pending,
    );

    if (res.ok || pending) {
      State.resetEmail = email;
      const hint = document.getElementById('reset-email-hint');
      if (hint) hint.textContent = email;
      Router.goAuth('reset-password');
      clearOtp('otp-reset');
      Toast.show('Reset code sent to your email.', 'success', 5000);
    } else {
      showAlert('forgot-alert', extractError(res.data));
    }
  } catch {
    showAlert('forgot-alert', 'Unable to send password reset code.');
  } finally {
    setLoading('btn-forgot', false);
  }
});


/* ============================================================
   VERIFY OTP  (password reset — step 1)
   ============================================================ */

document.getElementById('btn-verify-otp')?.addEventListener('click', async () => {
  clearAlert('reset-alert');

  const code = getOtpValue('otp-reset').trim();
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    return showAlert('reset-alert', 'Please enter the full 6-digit code.');
  }

  setLoading('btn-verify-otp', true);
  try {
    const res = await API.auth.verifyPasswordResetCode(code);

    if (res.status === 200) {
      State.verifiedOtpCode = code;
      document.getElementById('reset-phase-otp').style.display      = 'none';
      document.getElementById('reset-phase-password').style.display = '';
      document.getElementById('reset-new-password')?.focus();

    } else if (res.status === 409) {
      State.verifiedOtpCode = '';
      State.resetEmail      = '';
      clearOtp('otp-reset');
      Router.goAuth('forgot-password');
      showAlert('forgot-alert', 'Your session expired. Please request a new code.');

    } else {
      clearOtp('otp-reset');
      showAlert('reset-alert',
        extractError(res.data) || 'Invalid or expired code. Please try again.');
    }
  } catch {
    showAlert('reset-alert', 'Unable to verify code. Please try again.');
  } finally {
    setLoading('btn-verify-otp', false);
  }
});


/* ============================================================
   RESET PASSWORD  (step 2)
   ============================================================ */

document.getElementById('btn-reset-password')?.addEventListener('click', async () => {
  clearAlert('reset-alert');

  const code     = State.verifiedOtpCode;
  const password = document.getElementById('reset-new-password')?.value     || '';
  const confirm  = document.getElementById('reset-confirm-password')?.value || '';

  if (code.length !== 6)   return showAlert('reset-alert', 'Please verify your code first.');
  if (!password)            return showAlert('reset-alert', 'Please enter a new password.');
  if (password.length < 8)  return showAlert('reset-alert', 'New password must be at least 8 characters.');
  if (password !== confirm)  return showAlert('reset-alert', 'Passwords do not match.');

  setLoading('btn-reset-password', true);
  try {
    const res = await API.auth.resetPasswordByCode({ key: code, password });

    if (res.ok && res.passwordReset) {
      const resetEmail = State.resetEmail;
      State.resetEmail      = '';
      State.verifiedOtpCode = '';
      clearOtp('otp-reset');

      document.getElementById('reset-new-password').value     = '';
      document.getElementById('reset-confirm-password').value = '';

      if (res.authenticated) {
        Toast.show('Password reset successfully! 🎉', 'success');
        showApp();
      } else {
        Router.goAuth('login');
        const loginEmail = document.getElementById('login-email');
        if (loginEmail && resetEmail) loginEmail.value = resetEmail;
        Toast.show('Password reset! Please log in with your new password.', 'success', 6000);
      }
      return;
    }

    const errors     = res.data?.errors || [];
    const keyInvalid = errors.some(e =>
      e.param === 'key' ||
      ['token_invalid', 'password_reset_key_invalid', 'password_reset_by_code_invalid'].includes(e.code),
    );

    if (res.status === 409) {
      State.verifiedOtpCode = '';
      State.resetEmail      = '';
      clearOtp('otp-reset');
      Router.goAuth('forgot-password');
      showAlert('forgot-alert', 'Your session expired. Please request a new code.');

    } else if (keyInvalid) {
      State.verifiedOtpCode = '';
      clearOtp('otp-reset');
      document.getElementById('reset-phase-otp').style.display      = '';
      document.getElementById('reset-phase-password').style.display = 'none';
      showAlert('reset-alert', 'Invalid or expired code. Please try again.');

    } else {
      showAlert('reset-alert', extractError(res.data));
    }
  } catch (err) {
    showAlert('reset-alert', err.message || 'Unable to reset password. Please try again.');
  } finally {
    setLoading('btn-reset-password', false);
  }
});


/* ============================================================
   LOGOUT
   ============================================================ */

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await API.auth.logout();
  State.user       = null;
  State.resetEmail = '';
  showAuth('login');
  Toast.show('Logged out.', 'info');
});


/* ============================================================
   PROFILE UPDATE
   ============================================================ */

document.getElementById('form-edit-profile')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('edit-profile-alert');

  const phone    = document.getElementById('edit-phone').value.trim();
  const file     = document.getElementById('edit-image')?.files[0];
  const formData = new FormData();
  formData.append('phone', phone);
  if (file) formData.append('image', file);

  setLoading('btn-save-profile', true);
  try {
    const res = await API.updateProfile(formData);
    if (res.ok) {
      Toast.show('Profile updated!', 'success');
      await loadMe();
      Router.go('profile');
    } else {
      showAlert('edit-profile-alert', extractError(res.data));
    }
  } finally {
    setLoading('btn-save-profile', false);
  }
});


/* ============================================================
   CHANGE PASSWORD
   ============================================================ */

document.getElementById('form-change-password')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('change-pw-alert');

  const current     = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirm     = document.getElementById('confirm-new-password').value;

  if (!current)                return showAlert('change-pw-alert', 'Current password is required.');
  if (newPassword !== confirm)  return showAlert('change-pw-alert', 'Passwords do not match.');
  if (newPassword.length < 8)   return showAlert('change-pw-alert', 'New password must be at least 8 characters.');

  setLoading('btn-change-password', true);
  try {
    const res = await API.auth.changePassword({ current_password: current, new_password: newPassword });
    if (res.ok) {
      Toast.show('Password changed successfully!', 'success');
      e.target.reset();
      showAlert('change-pw-alert', 'Password updated!', 'success');
    } else {
      showAlert('change-pw-alert', extractError(res.data));
    }
  } finally {
    setLoading('btn-change-password', false);
  }
});


/* ============================================================
   AVATAR PREVIEW
   ============================================================ */

document.getElementById('edit-image')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = document.getElementById('edit-avatar-preview');
    if (preview) preview.innerHTML = `<img src="${ev.target.result}" alt="preview">`;
  };
  reader.readAsDataURL(file);
});


/* ============================================================
   API EXPLORER
   ============================================================ */

document.querySelectorAll('.endpoint-header').forEach(header => {
  header.addEventListener('click', () => {
    const body  = header.nextElementSibling;
    const arrow = header.querySelector('.ep-arrow');
    body?.classList.toggle('open');
    if (arrow) arrow.textContent = body?.classList.contains('open') ? '▲' : '▼';
  });
});

async function explorerCall(endpointId) {
  const resultEl = document.getElementById(`result-${endpointId}`);
  if (!resultEl) return;
  resultEl.textContent = 'Loading…';
  resultEl.className   = 'response-area';

  try {
    let res;
    switch (endpointId) {
      case 'get-me':      res = await API.getMe();             break;
      case 'get-profile': res = await API.getProfile();        break;
      case 'refresh':     res = await API.auth.refreshToken(); break;
      default: return;
    }
    resultEl.textContent = JSON.stringify(res.data, null, 2);
    resultEl.className   = `response-area ${res.ok ? 'success-response' : 'error-response'}`;
  } catch (err) {
    resultEl.textContent = `Error: ${err.message}`;
    resultEl.className   = 'response-area error-response';
  }
}

window.explorerCall = explorerCall;


/* ============================================================
   GOOGLE SIGN-IN  —  button-click handler
   ============================================================

   SPEC:
     ┌─────────────────────────────────────────────────────────┐
     │ Thing                    │ In your control? │ Reality   │
     ├─────────────────────────────────────────────────────────┤
     │ Consent on 1st sign-in   │ ❌ No            │ Always    │
     │ Picker on 1st sign-in    │ ❌ No            │ If multi  │
     │ Consent on 2nd sign-in   │ ✅ Auto          │ Skipped   │
     │ Picker on 2nd sign-in    │ ✅ auto_select   │ Skipped   │
     └─────────────────────────────────────────────────────────┘

   IMPORTANT — NO auto-prompt on page load:
     The previous implementation called initOneTap() in
     DOMContentLoaded, which silently signed the user in if they had
     a valid session — even before they clicked anything.
     That has been removed. Google sign-in now starts ONLY when the
     user explicitly clicks the "Sign in with Google" button.

   SIGN-OUT BEHAVIOUR:
     logout() is a soft/local logout (Tokens.clearSession). It clears
     the access_token so the UI shows as "logged out", but deliberately
     keeps the refresh_token so the NEXT explicit button click can
     silently re-authenticate via refreshToken() — bypassing the
     Google picker. This is the correct behaviour per the spec table
     ("Picker on 2nd sign-in → auto_select: true handles this").
   ============================================================ */

/** Flag to prevent concurrent Google sign-in attempts. */
let googleLoginInProgress = false;

/**
 * Shared handler for both "Continue with Google" (login) and
 * "Sign up with Google" (register) buttons.
 */
async function handleGoogleLogin() {
  if (googleLoginInProgress) return;
  googleLoginInProgress = true;

  const LOADING_HTML = `
    <span style="display:inline-flex;align-items:center;gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Connecting…
    </span>`;

  const buttons = [
    document.getElementById('btn-google-login'),
    document.getElementById('btn-google-register'),
  ].filter(Boolean);

  // Snapshot button HTML so we can restore the Google icon after.
  const originals = new Map(buttons.map(btn => [btn, btn.innerHTML]));
  buttons.forEach(btn => {
    btn.disabled  = true;
    btn.innerHTML = LOADING_HTML;
  });

  try {
    const result = await API.auth.loginWithGoogleButton();

    if (result.ok) {
      // Transition to app shell first so the UI feels instant,
      // then await /api/me/ to populate user info before toast.
      document.getElementById('auth-shell').style.display = 'none';
      document.getElementById('app-shell').style.display  = 'flex';
      Router.go('dashboard');
      await loadMe();
      Toast.show('Signed in with Google.', 'success');
      return;
    }

    if (result.cancelled) {
      Toast.show('Google sign-in was cancelled.', 'info');
      return;
    }

    Toast.show(
      result.data?.detail || result.data?.errors?.[0]?.message || 'Google sign-in failed.',
      'error',
    );

  } catch (err) {
    Toast.show(err.message || 'Google sign-in failed.', 'error');
  } finally {
    googleLoginInProgress = false;
    buttons.forEach(btn => {
      btn.disabled  = false;
      btn.innerHTML = originals.get(btn) || btn.innerHTML;
    });
  }
}

document.getElementById('btn-google-login')?.addEventListener('click', handleGoogleLogin);
document.getElementById('btn-google-register')?.addEventListener('click', handleGoogleLogin);


/* ============================================================
   MOBILE SIDEBAR
   ============================================================ */

document.getElementById('hamburger')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-overlay')?.classList.toggle('open');
});

document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
});


/* ============================================================
   INITIALIZATION
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();
  setupOtpInputs('otp-verify-email');
  setupOtpInputs('otp-reset');

  // Hide all alert banners at startup.
  document.querySelectorAll('.alert').forEach(el => { el.style.display = 'none'; });

  // Password visibility toggles.
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.input-group')?.querySelector('input');
      if (!input) return;
      input.type    = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });

  // Seed CSRF cookie before any state-changing requests.
  try {
    await fetch(`${ALLAUTH}/config`, { credentials: 'include' });
  } catch {
    console.warn('Could not initialise CSRF.');
  }

  // Restore session if a valid access_token exists in localStorage.
  // IMPORTANT: we do NOT auto-trigger Google sign-in here.
  // The user must explicitly click "Sign in with Google" to authenticate.
  if (Tokens.isLoggedIn()) {
    showApp();
  } else {
    showAuth('login');
    // NOTE: initOneTap() has been intentionally removed.
    // Auto-prompting Google One Tap on page load violates the spec:
    // "don't sign in automatically until sign in with google is clicked".
  }
});