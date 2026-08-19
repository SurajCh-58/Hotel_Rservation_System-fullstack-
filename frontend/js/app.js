/* ============================================================
   app.js
   HotelReservation frontend

   AUTH FLOWS
   ============================================================

   SIGNUP
   -------
   signup
      ↓
   pending verify_email
      ↓
   email OTP
      ↓
   verifyEmail()
      ↓
   JWT access + refresh
      ↓
   application


   PASSWORD RESET
   --------------
   email
      ↓
   password/request
      ↓
   401 + pending password_reset_by_code
      ↓ session_token stored automatically
   OTP
      ↓
   POST password/reset  (X-Session-Token sent, validates key + sets password)
      ↓
   200 = password changed + logged in
   401 = password changed + NOT logged in
      ↓
   login


   GOOGLE LOGIN  (Flow B — Pure Headless Token)
   -------
   initCodeClient({ ux_mode:'popup', prompt:'select_account consent' })
      ↓ requestCode() — must be called inside a user gesture
   GIS popup → user picks account + grants consent
      ↓
   callback({ code: '4/0A...' })
      ↓
   POST /_allauth/app/v1/auth/provider/token
      ↓
   JWT access + refresh → showApp()
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

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span>${msg}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    this.container?.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('fadeOut');
        setTimeout(() => toast.remove(), 250);
      }, duration);
    }
  }

};


/* ============================================================
   ROUTER
   ============================================================ */

const Router = {

  current: null,

  go(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));

    const view    = document.getElementById(`view-${viewId}`);
    const navLink = document.querySelector(`[data-view="${viewId}"]`);

    if (view)    view.classList.add('active');
    if (navLink) navLink.classList.add('active');

    this.current = viewId;

    const titles = {
      dashboard:         ['Dashboard',       'Welcome back!'],
      profile:           ['My Profile',      'View & manage your profile'],
      'edit-profile':    ['Edit Profile',    'Update your profile information'],
      'change-password': ['Change Password', 'Update your account password'],
      endpoints:         ['API Explorer',    'Test all backend endpoints directly']
    };

    const [title, subtitle] = titles[viewId] || ['', ''];

    const titleEl    = document.getElementById('topbar-title');
    const subtitleEl = document.getElementById('topbar-subtitle');

    if (titleEl)    titleEl.textContent    = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;

    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
  },

  goAuth(authView) {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));

    const view = document.getElementById(`auth-${authView}`);
    if (view) view.classList.add('active');

    /* When entering reset-password, always start at phase 1 (OTP). */
    if (authView === 'reset-password') {
      const phaseOtp      = document.getElementById('reset-phase-otp');
      const phasePassword = document.getElementById('reset-phase-password');
      if (phaseOtp)      phaseOtp.style.display      = '';
      if (phasePassword) phasePassword.style.display = 'none';
      State.verifiedOtpCode = '';
    }
  }

};


/* ============================================================
   APPLICATION STATE
   ============================================================ */

const State = {
  user:             null,
  resetEmail:       '',
  resetKey:         '',
  verifiedOtpCode:  ''
};


/* ============================================================
   AUTH / APP SHELL
   ============================================================ */

function showApp() {
  const authShell = document.getElementById('auth-shell');
  const appShell  = document.getElementById('app-shell');

  if (authShell) authShell.style.display = 'none';
  if (appShell)  appShell.style.display  = 'flex';

  Router.go('dashboard');
  loadMe();
}

function showAuth(view = 'login') {
  const authShell = document.getElementById('auth-shell');
  const appShell  = document.getElementById('app-shell');

  if (authShell) authShell.style.display = 'flex';
  if (appShell)  appShell.style.display  = 'none';

  Router.goAuth(view);
}


/* ============================================================
   LOAD USER
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


/* ============================================================
   RENDER USER
   ============================================================ */

function renderUserInfo(user) {
  if (!user) return;

  const initials = (user.full_name || user.email || 'U').substring(0, 2).toUpperCase();
  const profile  = user.profile || user.profiles || {};
  const imageUrl = profile.image || null;

  /* ── Sidebar ─────────────────────────────────────────────── */
  const miniAvatar = document.getElementById('mini-avatar');
  if (miniAvatar) {
    miniAvatar.textContent = initials;
    if (imageUrl) miniAvatar.innerHTML = `<img src="${imageUrl}" alt="avatar">`;
  }

  const miniName  = document.getElementById('mini-name');
  if (miniName)  miniName.textContent  = user.full_name || '—';

  const miniEmail = document.getElementById('mini-email');
  if (miniEmail) miniEmail.textContent = user.email || '';

  /* ── Dashboard ───────────────────────────────────────────── */
  const dashName  = document.getElementById('dash-name');
  if (dashName)  dashName.textContent  = user.full_name || '—';

  const dashEmail = document.getElementById('dash-email');
  if (dashEmail) dashEmail.textContent = user.email || '';

  const dashPhone = document.getElementById('dash-phone');
  if (dashPhone) dashPhone.textContent = profile.phone || 'Not set';

  const dashId = document.getElementById('dash-id');
  if (dashId)  dashId.textContent = `#${user.id}`;

  const dashAvatar = document.getElementById('dash-avatar');
  if (dashAvatar) {
    dashAvatar.textContent = initials;
    if (imageUrl) dashAvatar.innerHTML = `<img src="${imageUrl}" alt="avatar">`;
  }

  /* ── Dashboard info-grid (dash-name-2 / dash-email-2) ────── */
  const dashName2  = document.getElementById('dash-name-2');
  if (dashName2)  dashName2.textContent  = user.full_name || '—';

  const dashEmail2 = document.getElementById('dash-email-2');
  if (dashEmail2) dashEmail2.textContent = user.email || '';

  /* ── Profile ─────────────────────────────────────────────── */
  const profileName  = document.getElementById('profile-name');
  if (profileName)  profileName.textContent  = user.full_name || '—';

  const profileEmail = document.getElementById('profile-email');
  if (profileEmail) profileEmail.textContent = user.email || '';

  const profilePhone = document.getElementById('profile-phone');
  if (profilePhone) profilePhone.textContent = profile.phone || 'Not set';

  const profileId = document.getElementById('profile-id');
  if (profileId)  profileId.textContent = `#${user.id}`;

  const profAvatar = document.getElementById('profile-avatar');
  if (profAvatar) {
    profAvatar.textContent = initials;
    if (imageUrl) profAvatar.innerHTML = `<img src="${imageUrl}" alt="avatar">`;
  }

  /* ── Profile card info-grid (profile-name2 / profile-email2) */
  const profileName2  = document.getElementById('profile-name2');
  if (profileName2)  profileName2.textContent  = user.full_name || '—';

  const profileEmail2 = document.getElementById('profile-email2');
  if (profileEmail2) profileEmail2.textContent = user.email || '';

  /* ── Edit profile ────────────────────────────────────────── */
  const editPhone = document.getElementById('edit-phone');
  if (editPhone)  editPhone.value = profile.phone || '';

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


/* ============================================================
   ERROR HANDLING
   ============================================================ */

function extractError(data) {
  if (!data) return 'Something went wrong. Please try again.';
  if (typeof data === 'string') return data;

  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map(error => {
      const friendly = {
        email_taken:                   'This email is already registered.',
        password_too_short:            'Password is too short (minimum 8 characters).',
        password_too_common:           'This password is too common. Choose a stronger one.',
        password_too_similar:          'Password is too similar to your email.',
        password_entirely_numeric:     'Password cannot be entirely numbers.',
        required:                      error.param
                                         ? `${error.param.replace(/_/g, ' ')} is required.`
                                         : 'This field is required.',
        enter_email:                   'Please enter a valid email address.',
        invalid:                       error.param
                                         ? `Invalid ${error.param.replace(/_/g, ' ')}.`
                                         : 'Invalid input.',
        incorrect_code:                'The code is incorrect or has expired. Please try again.',
        password_reset_key_invalid:    'The reset code is invalid or has expired.',
        password_reset_by_code_invalid:'The reset code is invalid or has expired.',
        token_invalid:                 'The reset code is invalid or has expired.',
        invalid_password:              'The new password is invalid.',
        password_mismatch:             'Passwords do not match.'
      };
      return friendly[error.code] || error.message || 'Unknown error.';
    }).join(' ');
  }

  if (data.detail) return data.detail;

  if (Array.isArray(data.non_field_errors)) {
    return data.non_field_errors.join(' ');
  }

  const values = Object.values(data).flat().filter(v => typeof v === 'string');
  if (values.length) return values.join(' ');

  return 'Something went wrong. Please try again.';
}


/* ============================================================
   OTP
   ============================================================ */

function setupOtpInputs(containerId) {
  const inputs = document.querySelectorAll(`#${containerId} .otp-input`);

  inputs.forEach((input, index) => {

    input.addEventListener('input', event => {
      const value = event.target.value.replace(/\D/g, '');
      event.target.value = value.slice(-1);
      if (value && index < inputs.length - 1) inputs[index + 1].focus();
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', event => {
      event.preventDefault();
      const paste = (event.clipboardData || window.clipboardData)
        .getData('text')
        .replace(/\D/g, '');
      inputs.forEach((el, i) => { el.value = paste[i] || ''; });
      if (paste.length >= inputs.length) inputs[inputs.length - 1].focus();
    });

  });
}

function getOtpValue(containerId) {
  return [...document.querySelectorAll(`#${containerId} .otp-input`)]
    .map(input => input.value)
    .join('');
}

function clearOtp(containerId) {
  document.querySelectorAll(`#${containerId} .otp-input`).forEach(input => {
    input.value = '';
  });
  document.querySelector(`#${containerId} .otp-input`)?.focus();
}


/* ============================================================
   SIGNUP
   ============================================================ */

document.getElementById('form-register')?.addEventListener('submit', async event => {

  event.preventDefault();
  clearAlert('reg-alert');

  const email     = document.getElementById('reg-email').value.trim();
  const full_name = document.getElementById('reg-name').value.trim();
  const password  = document.getElementById('reg-password').value;
  const confirm   = document.getElementById('reg-confirm').value;

  if (!email)    return showAlert('reg-alert', 'Email is required.');
  if (!full_name) return showAlert('reg-alert', 'Full name is required.');
  if (password !== confirm) return showAlert('reg-alert', 'Passwords do not match.');
  if (password.length < 8)  return showAlert('reg-alert', 'Password is too short (minimum 8 characters).');
  if (/^[0-9]+$/.test(password)) return showAlert('reg-alert', 'Password cannot be entirely numbers.');

  setLoading('btn-register', true);

  try {
    const res = await API.auth.signup({ email, password, full_name });

    const pending = res.data?.data?.flows?.some(
      flow => flow.id === 'verify_email' && flow.is_pending
    );

    if (res.ok || pending) {
      const hint = document.getElementById('verify-email-hint');
      if (hint) hint.textContent = email;

      Router.goAuth('verify-email');
      clearOtp('otp-verify-email');
      Toast.show('Account created! Check your email for your 6-digit verification code.', 'success', 6000);
    } else {
      showAlert('reg-alert', extractError(res.data));
    }
  } catch (error) {
    console.error('Signup error:', error);
    showAlert('reg-alert', 'Unable to create account.');
  } finally {
    setLoading('btn-register', false);
  }

});


/* ============================================================
   LOGIN
   ============================================================ */

document.getElementById('form-login')?.addEventListener('submit', async event => {

  event.preventDefault();
  clearAlert('login-alert');

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email)    return showAlert('login-alert', 'Email is required.');
  if (!password) return showAlert('login-alert', 'Password is required.');

  setLoading('btn-login', true);

  try {
    const res = await API.auth.login({ email, password });

    const pending = res.data?.data?.flows?.some(
      flow => flow.id === 'verify_email' && flow.is_pending
    );

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
  } catch (error) {
    console.error('Login error:', error);
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

      const original = btn.textContent;
      let seconds = 30;
      btn.textContent = `Resend in ${seconds}s`;

      const interval = setInterval(() => {
        seconds--;
        btn.textContent = `Resend in ${seconds}s`;
        if (seconds <= 0) {
          clearInterval(interval);
          btn.textContent = original;
          btn.disabled = false;
        }
      }, 1000);
    } else {
      Toast.show(extractError(res.data), 'error');
      btn.disabled = false;
    }
  } catch (error) {
    console.error(error);
    Toast.show('Unable to resend verification code.', 'error');
    btn.disabled = false;
  }

});


/* ============================================================
   FORGOT PASSWORD
   ============================================================ */

document.getElementById('form-forgot')?.addEventListener('submit', async event => {

  event.preventDefault();
  clearAlert('forgot-alert');

  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return showAlert('forgot-alert', 'Please enter your email address.');

  setLoading('btn-forgot', true);

  try {
    const res = await API.auth.requestPasswordReset(email);

    /*
     * allauth can return 401 with password_reset_by_code pending.
     * That means the OTP flow started successfully.
     */
    const pending = res.data?.data?.flows?.some(
      flow => flow.id === 'password_reset_by_code' && flow.is_pending
    );

    if (res.ok || pending) {
      State.resetEmail = email;
      State.resetKey   = '';

      const hint = document.getElementById('reset-email-hint');
      if (hint) hint.textContent = email;

      Router.goAuth('reset-password');
      clearOtp('otp-reset');
      Toast.show('Reset code sent to your email.', 'success', 5000);
    } else {
      showAlert('forgot-alert', extractError(res.data));
    }
  } catch (error) {
    console.error('Password reset request error:', error);
    showAlert('forgot-alert', 'Unable to send password reset code.');
  } finally {
    setLoading('btn-forgot', false);
  }

});


/* ============================================================
   VERIFY OTP  (Step 1 of password reset)

   Calls GET /auth/password/reset with X-Password-Reset-Key header.
   - 200  → code is valid → reveal password fields
   - 400  → wrong code   → show error, stay on OTP step
   - 409  → session gone → back to forgot-password
   ============================================================ */

document.getElementById('btn-verify-otp')?.addEventListener('click', async () => {

  clearAlert('reset-alert');

  const code = getOtpValue('otp-reset').trim();
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    return showAlert('reset-alert', 'Please enter the full 6-digit code.');
  }

  setLoading('btn-verify-otp', true);

  try {
    const verifyRes = await API.auth.verifyPasswordResetCode(code);
    console.log('[AUTH] OTP verify response:', verifyRes);

    if (verifyRes.status === 200) {
      /* ── Code is valid ── */
      State.verifiedOtpCode = code;
      document.getElementById('reset-phase-otp').style.display      = 'none';
      document.getElementById('reset-phase-password').style.display = '';
      document.getElementById('reset-new-password')?.focus();

    } else if (verifyRes.status === 409) {
      /* ── Session expired — no pending flow ── */
      State.verifiedOtpCode = '';
      State.resetEmail = '';
      clearOtp('otp-reset');
      Router.goAuth('forgot-password');
      showAlert('forgot-alert', 'Your session expired. Please request a new code.');

    } else {
      /* ── Wrong code (400 token_invalid) ── */
      clearOtp('otp-reset');
      showAlert('reset-alert',
        extractError(verifyRes.data) || 'Invalid or expired code. Please try again.'
      );
    }
  } catch (error) {
    console.error('[AUTH] OTP verify error:', error);
    showAlert('reset-alert', 'Unable to verify code. Please try again.');
  } finally {
    setLoading('btn-verify-otp', false);
  }

});


/* ============================================================
   RESET PASSWORD
   ============================================================ */

document.getElementById('btn-reset-password')?.addEventListener('click', async () => {

  clearAlert('reset-alert');

  /* Use the OTP that was already verified in phase 1 */
  const code     = State.verifiedOtpCode || '';
  const password = document.getElementById('reset-new-password')?.value     || '';
  const confirm  = document.getElementById('reset-confirm-password')?.value || '';

  /* ── Validation ── */
  if (code.length !== 6)  return showAlert('reset-alert', 'Please enter the full 6-digit code.');
  if (!password)           return showAlert('reset-alert', 'Please enter a new password.');
  if (password.length < 8) return showAlert('reset-alert', 'New password must be at least 8 characters.');
  if (password !== confirm) return showAlert('reset-alert', 'Passwords do not match.');

  setLoading('btn-reset-password', true);

  try {
    /*
     * POST /auth/password/reset validates the OTP key and
     * changes the password in one request.
     * X-Session-Token is sent automatically by apiFetch.
     */
    const resetRes = await API.auth.resetPasswordByCode({ key: code, password });
    console.log('[AUTH] Password reset response:', resetRes);

    if (resetRes.ok && resetRes.passwordReset) {

      const resetEmail = State.resetEmail;
      State.resetKey         = '';
      State.resetEmail       = '';
      State.verifiedOtpCode  = '';
      clearOtp('otp-reset');

      const newPwEl     = document.getElementById('reset-new-password');
      const confirmPwEl = document.getElementById('reset-confirm-password');
      if (newPwEl)     newPwEl.value     = '';
      if (confirmPwEl) confirmPwEl.value = '';

      /* ── Case 1: allauth authenticated the user automatically ── */
      if (resetRes.authenticated) {
        Toast.show('Password reset successfully! 🎉', 'success');
        showApp();
      } else {
        /* ── Case 2: Password changed but login required ── */
        Router.goAuth('login');
        const loginEmail = document.getElementById('login-email');
        if (loginEmail && resetEmail) loginEmail.value = resetEmail;
        Toast.show(
          'Password reset successfully! Please log in with your new password.',
          'success', 6000
        );
      }
      return;
    }

    /* ── Actual reset failure ── */
    const failErrors  = resetRes.data?.errors || [];
    const isKeyInvalid = failErrors.some(
      e => e.param === 'key' ||
           e.code === 'token_invalid' ||
           e.code === 'password_reset_key_invalid' ||
           e.code === 'password_reset_by_code_invalid'
    );
    const isConflict = resetRes.status === 409;

    if (isConflict) {
      State.verifiedOtpCode = '';
      State.resetEmail = '';
      clearOtp('otp-reset');
      Router.goAuth('forgot-password');
      showAlert('forgot-alert', 'Your session expired. Please request a new code.');

    } else if (isKeyInvalid) {
      State.verifiedOtpCode = '';
      clearOtp('otp-reset');
      const phaseOtp      = document.getElementById('reset-phase-otp');
      const phasePassword = document.getElementById('reset-phase-password');
      if (phaseOtp)      phaseOtp.style.display      = '';
      if (phasePassword) phasePassword.style.display = 'none';
      showAlert('reset-alert', 'Invalid or expired code. Please try again.');

    } else {
      /* Password validation error — stay on phase 2 */
      showAlert('reset-alert', extractError(resetRes.data));
    }

  } catch (error) {
    console.error('[AUTH] Password reset error:', error);
    showAlert('reset-alert', error.message || 'Unable to reset password. Please try again.');
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
  State.resetKey   = '';

  showAuth('login');
  Toast.show('Logged out.', 'info');

});


/* ============================================================
   PROFILE UPDATE
   ============================================================ */

document.getElementById('form-edit-profile')?.addEventListener('submit', async event => {

  event.preventDefault();
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
      Toast.show('Profile updated successfully!', 'success');
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

document.getElementById('form-change-password')?.addEventListener('submit', async event => {

  event.preventDefault();
  clearAlert('change-pw-alert');

  const current     = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirm     = document.getElementById('confirm-new-password').value;

  if (!current)           return showAlert('change-pw-alert', 'Current password is required.');
  if (newPassword !== confirm)  return showAlert('change-pw-alert', 'Passwords do not match.');
  if (newPassword.length < 8)   return showAlert('change-pw-alert', 'New password must be at least 8 characters.');

  setLoading('btn-change-password', true);

  try {
    const res = await API.auth.changePassword({
      current_password: current,
      new_password:     newPassword
    });

    if (res.ok) {
      Toast.show('Password changed successfully!', 'success');
      event.target.reset();
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

document.getElementById('edit-image')?.addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = loadEvent => {
    const preview = document.getElementById('edit-avatar-preview');
    if (preview) preview.innerHTML = `<img src="${loadEvent.target.result}" alt="preview">`;
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
    if (body) body.classList.toggle('open');
    if (arrow) arrow.textContent = body?.classList.contains('open') ? '▲' : '▼';
  });
});

async function explorerCall(endpointId) {
  const resultEl = document.getElementById(`result-${endpointId}`);
  if (!resultEl) return;

  resultEl.textContent = 'Loading…';
  resultEl.className   = 'response-area';

  let res;

  try {
    switch (endpointId) {
      case 'get-me':      res = await API.getMe();                break;
      case 'get-profile': res = await API.getProfile();           break;
      case 'refresh':     res = await API.auth.refreshToken();    break;
      default: return;
    }

    resultEl.textContent = JSON.stringify(res.data, null, 2);
    resultEl.className   = `response-area ${res.ok ? 'success-response' : 'error-response'}`;
  } catch (error) {
    resultEl.textContent = `Error: ${error.message}`;
    resultEl.className   = 'response-area error-response';
  }
}

window.explorerCall = explorerCall;


/* ============================================================
   GOOGLE LOGIN  (Flow B — initCodeClient)
   ============================================================

   handleGoogleLogin wires up all .btn-google buttons.

   Result shape from API.auth.loginWithGoogle():
     { ok: true }              → authenticated, show app
     { cancelled: true }       → user closed popup / clicked Cancel
     { pendingSignup: true }   → new Google user, allauth needs more info
     { pendingEmail: true }    → Google user needs email verification
     { ok: false, data }       → error from allauth
   ============================================================ */

let googleLoginInProgress = false;

async function handleGoogleLogin() {

    if (googleLoginInProgress) {
        return;
    }

    googleLoginInProgress = true;

    // Query both buttons so we can disable/restore all of them
    const buttons = [
        document.getElementById('btn-google-login'),
        document.getElementById('btn-google-register'),
    ].filter(Boolean);

    // Save full innerHTML (preserves the SVG Google icon) and show a loading state
    const LOADING_HTML = `<span style="display:inline-flex;align-items:center;gap:8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Connecting…</span>`;

    const originalHTMLs = new Map();
    buttons.forEach(btn => {
        originalHTMLs.set(btn, btn.innerHTML);
        btn.disabled = true;
        btn.innerHTML = LOADING_HTML;
    });

    try {

        const result = await API.auth.loginWithGoogle();

        console.log('Google login result:', result);

        if (result.ok) {

            /*
             * Show the app shell immediately so the UI transition feels instant,
             * then explicitly await loadMe() before showing the success toast.
             *
             * WHY: showApp() calls loadMe() internally but does NOT await it —
             * it fires and forgets. For Google login this causes a race condition:
             * the dashboard renders before /api/me/ responds, leaving full_name
             * and profile fields showing "—".
             *
             * By calling showApp() (which switches shells + navigates router) and
             * then awaiting loadMe() ourselves, we guarantee renderUserInfo() has
             * run with real data before the toast appears.
             *
             * showApp() internal loadMe() will also fire (unawaited) — that's fine.
             * The second loadMe() here wins because it runs after the JWT is saved
             * and it awaits the /api/me/ response before resolving.
             */
            const authShell = document.getElementById('auth-shell');
            const appShell  = document.getElementById('app-shell');
            if (authShell) authShell.style.display = 'none';
            if (appShell)  appShell.style.display  = 'flex';
            Router.go('dashboard');

            // Await the /api/me/ fetch so full_name + profile are populated
            // before renderUserInfo() runs and the toast shows.
            await loadMe();

            Toast.show(
                'Successfully signed in with Google.',
                'success'
            );

            return;
        }

        /*
         * Google popup was cancelled or closed by the user.
         * loginWithGoogle sets result.cancelled = true for these cases.
         */
        if (result.cancelled) {
            Toast.show(
                'Google sign-in was cancelled.',
                'info'
            );

            return;
        }

        const message =
            result.data?.detail ||
            result.data?.errors?.[0]?.message ||
            'Google sign-in failed.';

        Toast.show(message, 'error');

    } catch (error) {

        console.error(error);

        Toast.show(
            error.message || 'Google sign-in failed.',
            'error'
        );

    } finally {

        googleLoginInProgress = false;

        // Restore all buttons with their original HTML (icon + label intact)
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.innerHTML = originalHTMLs.get(btn) || btn.innerHTML;
        });
    }
}
document
    .getElementById('btn-google-login')
    ?.addEventListener(
        'click',
        handleGoogleLogin
    );

document
    .getElementById('btn-google-register')
    ?.addEventListener(
        'click',
        handleGoogleLogin
    );

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

  document.querySelectorAll('.alert').forEach(alert => {
    alert.style.display = 'none';
  });

  /* ── Password visibility toggle ── */
  document.querySelectorAll('.toggle-pw').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.closest('.input-group')?.querySelector('input');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });

  /* ── Seed CSRF cookie ── */
  try {
    await fetch(`${ALLAUTH}/config`, { credentials: 'include' });
  } catch (_) {
    console.warn('Could not initialize CSRF.');
  }

  /* ── Restore login ── */
  if (Tokens.isLoggedIn()) {
    showApp();
  } else {
    showAuth('login');
  }

});