const SUPABASE_URL = 'https://fdibhjmbabdcphldnvmq.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_DErpFcOi5m4LMgkVYFP5Kg_6fhVxHqG';
    const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
    }

    function showLogin() {
      document.getElementById('forgot-panel').style.display = 'none';
      document.getElementById('login-panel').style.display = 'block';
    }

    async function signIn() {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const btn = document.getElementById('signin-btn');

      if (!email || !password) { showError('Please enter your email and password.'); return; }

      btn.disabled = true;
      btn.textContent = 'Signing in…';
      document.getElementById('error').style.display = 'none';

      const { data, error } = await db.auth.signInWithPassword({ email, password });

      if (error) {
        showError(error.message);
        btn.disabled = false;
        btn.textContent = 'Sign in';
        return;
      }

      const { data: userData } = await db.from('users').select('*').eq('email', email).single();
      const base = 'https://propel-paradise.github.io/Quran-Journey';

      // Admin bypass
      if (userData?.role === 'admin') {
        window.location.href = base + '/admin.html';
        return;
      }

      // Verify role matches selection
      const dbRole = selectedRole === 'school' ? 'teacher' : 'parent';
      if (userData && userData.role !== dbRole) {
        await db.auth.signOut();
        showError(`This account is registered as a ${userData.role === 'teacher' ? 'school' : userData.role}, not a ${selectedRole}.`);
        btn.disabled = false;
        btn.textContent = 'Sign in';
        return;
      }

      // Check user is_active
      if (userData && userData.is_active === false) {
        await db.auth.signOut();
        if (userData.org_id && userData.role === 'teacher') {
          window.location.href = base + '/reactivate.html?email=' + encodeURIComponent(email);
        } else {
          showError('Your account has been deactivated. Please contact your school administrator.');
          btn.disabled = false; btn.textContent = 'Sign in';
        }
        return;
      }

      // Check if first login
      if (userData && userData.must_change_password) {
        window.location.href = base + '/change-password.html';
        return;
      }

      // Check org is_active
      if (userData && userData.org_id && userData.role === 'teacher') {
        const { data: org } = await db.from('organizations').select('is_active, plan').eq('id', userData.org_id).single();
        if (org && org.is_active === false) {
          await db.auth.signOut();
          window.location.href = base + '/reactivate.html?email=' + encodeURIComponent(email);
          return;
        }
      }

      window.location.href = selectedRole === 'school' ? base + '/school.html' : base + '/parent.html';
    }

    async function changePassword() {
      const pw = document.getElementById('new-password').value;
      const pw2 = document.getElementById('new-password2').value;
      const btn = document.getElementById('changepw-btn');
      const errEl = document.getElementById('changepw-error');

      if (pw.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = 'block'; return; }
      if (pw !== pw2) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

      btn.disabled = true; btn.textContent = 'Saving…';
      errEl.style.display = 'none';

      const { error } = await db.auth.updateUser({ password: pw });
      if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Set Password & Continue'; return; }

      const { data: { session } } = await db.auth.getSession();
      if (session) {
        await db.from('users').update({ must_change_password: false }).eq('email', session.user.email);
        const { data: userData } = await db.from('users').select('role').eq('email', session.user.email).single();
        const base = 'https://propel-paradise.github.io/Quran-Journey';
        window.location.href = userData?.role === 'teacher' ? base + '/school.html' : base + '/parent.html';
      }
    }

    async function sendReset() {
      const email = document.getElementById('forgot-email').value.trim();
      const btn = document.getElementById('reset-btn');
      const errEl = document.getElementById('forgot-error');
      const sucEl = document.getElementById('forgot-success');

      if (!email) { errEl.textContent = 'Please enter your email.'; errEl.style.display = 'block'; return; }

      btn.disabled = true;
      btn.textContent = 'Sending…';
      errEl.style.display = 'none';
      sucEl.style.display = 'none';

      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://propel-paradise.github.io/Quran-Journey/reset-password.html'
      });

      btn.disabled = false;
      btn.textContent = 'Send reset link';

      if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; }
      else { sucEl.textContent = 'Reset link sent! Check your email.'; sucEl.style.display = 'block'; }
    }

    // Already logged in — redirect
    db.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        db.from('users').select('role, is_active').eq('email', session.user.email).single()
          .then(async ({ data }) => {
            const base = 'https://propel-paradise.github.io/Quran-Journey';
            if (data?.role === 'teacher' && data?.is_active !== false) {
              window.location.href = base + '/school.html';
            } else if (data?.role === 'parent' && data?.is_active !== false) {
              window.location.href = base + '/parent.html';
            } else if (data?.role === 'admin') {
              window.location.href = base + '/admin.html';
            } else {
              // No matching user row (e.g. deleted account) — sign out silently
              await db.auth.signOut();
              document.body.style.display = 'block';
            }
          });
      } else {
        document.body.style.display = 'block';
      }
    });

    document.addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });


// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/Quran-Journey/sw.js').catch(() => {});
  });
}
