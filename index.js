// Sign-in page. Settings (db, BASE) come from config.js.
let selectedRole = 'school';

function setRole(role) {
  selectedRole = role;
  document.getElementById('btn-school').classList.toggle('active', role === 'school');
  document.getElementById('btn-parent').classList.toggle('active', role === 'parent');
  document.getElementById('footer-org-link').style.display = role === 'school' ? 'block' : 'none';
  document.getElementById('footer-join-link').style.display = role === 'parent' ? 'block' : 'none';
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.style.display = 'block';
}

function showForgot() {
  document.getElementById('login-panel').style.display = 'none';
  document.getElementById('forgot-panel').style.display = 'block';
  document.getElementById('forgot-email').value = document.getElementById('email').value;
}

function showLogin() {
  document.getElementById('forgot-panel').style.display = 'none';
  document.getElementById('login-panel').style.display = 'block';
}

function resetSignInButton() {
  const btn = document.getElementById('signin-btn');
  btn.disabled = false;
  btn.textContent = 'Sign in';
}

// Sends a signed-in user to the right page. Used after sign-in and when a session already exists.
async function routeUser(authEmail, chosenRole) {
  const email = authEmail.toLowerCase();
  const { data: userData } = await db.from('users').select('*').eq('email', email).maybeSingle();

  if (!userData) {
    await db.auth.signOut();
    return { error: 'No Quran Journey account was found for this email. Please contact your school.' };
  }

  if (userData.role === 'admin') { window.location.href = BASE + '/admin.html'; return {}; }

  if (chosenRole) {
    const dbRole = chosenRole === 'school' ? 'teacher' : 'parent';
    if (userData.role !== dbRole) {
      await db.auth.signOut();
      return { error: `This account is registered as a ${userData.role === 'teacher' ? 'school' : userData.role}, not a ${chosenRole}.` };
    }
  }

  if (userData.is_active === false) {
    await db.auth.signOut();
    if (userData.org_id && userData.role === 'teacher') {
      window.location.href = BASE + '/reactivate.html?email=' + encodeURIComponent(email);
      return {};
    }
    return { error: 'Your account has been deactivated. Please contact your school administrator.' };
  }

  if (userData.role === 'teacher') {
    const { data: org } = userData.org_id
      ? await db.from('organizations').select('is_active').eq('id', userData.org_id).maybeSingle()
      : { data: null };
    if (!org || org.is_active === false) {
      await db.auth.signOut();
      window.location.href = BASE + '/reactivate.html?email=' + encodeURIComponent(email);
      return {};
    }
  }

  if (userData.must_change_password) { window.location.href = BASE + '/change-password.html'; return {}; }

  window.location.href = BASE + (userData.role === 'teacher' ? '/school.html' : '/parent.html');
  return {};
}

async function signIn() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('signin-btn');

  if (!email || !password) { showError('Please enter your email and password.'); return; }

  btn.disabled = true;
  btn.textContent = 'Signing in…';
  document.getElementById('error').style.display = 'none';

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    showError(error.message === 'Email not confirmed'
      ? 'Please confirm your email first. Check your inbox for the confirmation link.'
      : error.message);
    resetSignInButton();
    return;
  }

  // Use the email Supabase stored (always lowercase), not the one typed.
  const result = await routeUser(data.user.email, selectedRole);
  if (result.error) { showError(result.error); resetSignInButton(); }
}

async function sendReset() {
  const email = document.getElementById('forgot-email').value.trim().toLowerCase();
  const btn = document.getElementById('reset-btn');
  const errEl = document.getElementById('forgot-error');
  const sucEl = document.getElementById('forgot-success');

  if (!email) { errEl.textContent = 'Please enter your email.'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'Sending…';
  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: BASE + '/reset-password.html' });

  btn.disabled = false;
  btn.textContent = 'Send reset link';

  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; }
  else { sucEl.textContent = 'Reset link sent! Check your email.'; sucEl.style.display = 'block'; }
}

// Already signed in: go straight to the right page.
db.auth.getSession().then(async ({ data: { session } }) => {
  if (session) {
    const result = await routeUser(session.user.email, null);
    if (result.error) showError(result.error);
  }
});

// Enter submits whichever form is showing.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (document.getElementById('forgot-panel').style.display === 'block') sendReset();
  else signIn();
});

document.getElementById('app-version').textContent = APP_VERSION;
