// Shared settings and helpers. Loaded by every page right after the Supabase library.
const APP_VERSION = 'v1.8';
const SUPABASE_URL = 'https://fdibhjmbabdcphldnvmq.supabase.co';
// Publishable key: safe to be public. Data is protected by the database rules in supabase/migrations.
const SUPABASE_KEY = 'sb_publishable_DErpFcOi5m4LMgkVYFP5Kg_6fhVxHqG';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Folder the app is served from, e.g. https://propel-paradise.github.io/Quran-Journey
// Works on GitHub Pages and on a local test server without changes.
const BASE = location.origin + location.pathname.replace(/\/[^/]*$/, '');

// Always use this when putting names, emails or notes into HTML.
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Calls an edge function with the signed-in user's token. Returns { data } or { error: message }.
async function callFunction(name, body) {
  try {
    const { data, error } = await db.functions.invoke(name, { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) {}
      return { error: msg };
    }
    if (data && data.error) return { error: data.error };
    return { data };
  } catch (e) {
    return { error: 'Network error. Please check your connection and try again.' };
  }
}

// Random code like ABCD-EF23 (no look-alike characters).
function generateInviteCode() {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(bytes, b => c[b % c.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}

// Installable app (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

// Phone menu for the dashboards (sidebar slides in; see mobile.css).
function toggleNav(open) {
  document.body.classList.toggle('nav-open', open === undefined ? !document.body.classList.contains('nav-open') : open);
}
document.addEventListener('click', e => {
  if (e.target.closest && e.target.closest('.sidebar .nav-item, .sidebar .child-row')) toggleNav(false);
});
