// School (teacher) dashboard. Settings and helpers (db, BASE, escapeHtml, callFunction) come from config.js.
const RECENT_LOG_LIMIT = 200;

let currentUser = null, currentOrg = null, students = [], parents = [];
let recentLogs = [], weekLogs = [], lastLogByStudent = {};
let manzilFraction = null;
const qualityState = { sabaq: null, sabqi: null, manzil: null, behavior: null };

function localDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const todayStr = () => localDateStr(new Date());
const initialsOf = name => String(name || '').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
const fmtDate = (date, opts) => new Date(date + 'T12:00:00').toLocaleDateString('en-US', opts);

function pill(kind, text) {
  const m = { success: { bg: '#ecfdf5', c: '#047857' }, warn: { bg: '#fffbeb', c: '#b45309' }, danger: { bg: '#fef2f2', c: '#b91c1c' }, neutral: { bg: '#f4f3ef', c: '#3a3f3c' } };
  const t = m[kind] || m.neutral;
  return `<span class="pill" style="background:${t.bg};color:${t.c}">${escapeHtml(text)}</span>`;
}
function qpill(q) {
  if (!q) return '<span style="color:#737773;font-size:11px">—</span>';
  if (q === 'Excellent') return pill('success', q);
  if (q === 'Good') return pill('warn', q);
  if (q === 'Failed') return `<span class="pill" style="background:#fef2f2;color:#b91c1c;font-weight:600">Failed</span>`;
  return pill('danger', q);
}
function failedOr(failed, q) { return failed ? pill('danger', 'Failed') : qpill(q); }

function sabqiText(l) { return [l.sabqi_juz ? `Juz ${l.sabqi_juz}` : null, l.sabqi_pages ? `${l.sabqi_pages}p` : null].filter(Boolean).join(' · ') || '—'; }
function manzilText(l) {
  return [l.manzil_pages != null ? `${l.manzil_pages}${l.manzil_fraction ? ' ' + l.manzil_fraction : ''} Juz` : (l.manzil_fraction ? l.manzil_fraction + ' Juz' : null), l.manzil_juz].filter(Boolean).join(' · ') || '—';
}

function setQuality(type, val) {
  qualityState[type] = val;
  const prefix = { sabaq: 'sq', sabqi: 'sqi', manzil: 'mz', behavior: 'bh' }[type];
  ['excellent', 'good', 'needs', 'failed'].forEach(k => { const el = document.getElementById(`${prefix}-${k}`); if (el) el.className = 'quality-btn'; });
  const keyMap = { 'Excellent': 'excellent', 'Good': 'good', 'Needs Work': 'needs', 'Failed': 'failed' };
  const el = document.getElementById(`${prefix}-${keyMap[val]}`);
  if (el) el.classList.add(val === 'Failed' ? 'sel-failed' : `sel-${keyMap[val]}`);
}

function setManzilFraction(val) {
  const keys = ['quarter', 'half', 'three'];
  keys.forEach(k => { const el = document.getElementById(`mz-frac-${k}`); if (el) el.className = 'quality-btn'; });
  if (manzilFraction === val) { manzilFraction = null; return; }
  manzilFraction = val;
  const km = { '¼': 'quarter', '½': 'half', '¾': 'three' };
  const el = document.getElementById(`mz-frac-${km[val]}`);
  if (el) el.classList.add('sel-good');
}

function switchTab(tab) {
  ['students', 'parents', 'logs', 'settings'].forEach(t => {
    document.getElementById(`tab-${t}`).style.display = t === tab ? 'block' : 'none';
    document.getElementById(`nav-${t}`).classList.toggle('active', t === tab);
  });
  const labels = { students: 'Students', parents: 'Parents', logs: 'Progress Logs', settings: 'Settings' };
  document.getElementById('topbar-page').textContent = labels[tab] || tab;
}

async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = BASE + '/index.html'; return; }
  const email = session.user.email.toLowerCase();
  const { data: u } = await db.from('users').select('*').eq('email', email).maybeSingle();
  if (!u || u.role !== 'teacher' || !u.org_id) { window.location.href = BASE + '/index.html'; return; }
  if (u.is_active === false) { await db.auth.signOut(); window.location.href = BASE + '/reactivate.html?email=' + encodeURIComponent(email); return; }
  if (u.must_change_password) { window.location.href = BASE + '/change-password.html'; return; }

  const { data: org } = await db.from('organizations').select('*').eq('id', u.org_id).maybeSingle();
  if (!org || org.is_active === false) { await db.auth.signOut(); window.location.href = BASE + '/reactivate.html?email=' + encodeURIComponent(email); return; }

  currentUser = u; currentOrg = org;
  document.getElementById('sidebar-avatar').textContent = initialsOf(u.name);
  document.getElementById('sidebar-name').textContent = u.name;
  document.getElementById('sidebar-email').textContent = email;
  document.getElementById('settings-email').textContent = email;
  document.getElementById('topbar-org').textContent = u.name;
  document.getElementById('log-date').value = todayStr();
  document.getElementById('stat-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  document.getElementById('org-icon-text').textContent = initialsOf(org.name);
  document.getElementById('org-name-sidebar').textContent = org.name;
  document.getElementById('settings-org-name').textContent = org.name;
  const planLabel = org.plan === 'trial' ? 'Free Trial' : org.plan === 'cancelled' ? 'Cancelled' : org.plan === 'payment_failed' ? 'Payment Failed' : 'Pro';
  document.getElementById('org-plan-sidebar').textContent = planLabel;
  document.getElementById('subscription-status').textContent = org.plan === 'cancelled' ? '⚠️ Cancelled' : 'Active · ' + planLabel;
  if (org.plan === 'trial') document.getElementById('trial-card').style.display = 'block';

  await loadParents(); await loadStudents(); await loadLogs(); await loadInviteCode();
}

// ── PARENTS ─────────────────────────────────────────────────
function parentCheckboxes(listId, checkedEmails) {
  const el = document.getElementById(listId);
  el.innerHTML = parents.length === 0
    ? '<span style="font-size:12px;color:#737773">No parents registered yet.</span>'
    : parents.map(p => `<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:2px 0">
        <input type="checkbox" value="${escapeHtml(p.email)}"${checkedEmails.includes(p.email) ? ' checked' : ''} style="accent-color:#10b981;width:14px;height:14px">
        <span>${escapeHtml(p.name)} <span style="color:#737773;font-family:'IBM Plex Mono',monospace;font-size:11px">${escapeHtml(p.email)}</span></span>
      </label>`).join('');
}

async function loadParents() {
  const { data } = await db.from('users').select('*').eq('role', 'parent').eq('org_id', currentUser.org_id).order('name');
  parents = data || [];
  renderParents();
  parentCheckboxes('new-student-parents-list', []);
  document.getElementById('nav-count-parents').textContent = parents.length;
}

function renderParents() {
  const el = document.getElementById('parents-list');
  if (parents.length === 0) { el.innerHTML = `<div class="empty-state"><div class="big">👤</div>No parents yet. Share the invite code above with parents so they can register.</div>`; return; }
  el.innerHTML = parents.map(p => {
    const linkedNames = students.filter(s => (s.parent_emails || []).includes(p.email)).map(s => escapeHtml(s.name)).join(', ');
    return `<div class="table-row" style="grid-template-columns:1.5fr 1.5fr 1.5fr 80px">
      <div class="student-name">${escapeHtml(p.name)}</div>
      <div style="font-size:12px;color:#3a3f3c;font-family:'IBM Plex Mono',monospace">${escapeHtml(p.email)}</div>
      <div style="font-size:12px">${linkedNames || '<span style="color:#737773">None linked</span>'}</div>
      <div class="action-btns"><button class="row-btn row-btn-danger" onclick="removeParent(${Number(p.id)})">Remove</button></div>
    </div>`;
  }).join('');
}

// ── STUDENTS ────────────────────────────────────────────────
async function loadStudents() {
  const { data } = await db.from('students').select('*').eq('org_id', currentUser.org_id).order('name');
  students = data || [];
  renderStudents(); renderParents(); updateStats(); populateStudentSelect();
  document.getElementById('nav-count-students').textContent = students.length;
}

function renderStudents() {
  const el = document.getElementById('students-list');
  const search = (document.getElementById('student-search')?.value || '').toLowerCase();
  const filtered = students.filter(s => s.name.toLowerCase().includes(search));
  if (filtered.length === 0) {
    el.innerHTML = students.length === 0
      ? `<div class="empty-state"><div class="big">📚</div>No students yet. Add your first student to get started.</div>`
      : `<div class="empty-state"><div class="big">🔍</div>No students match "${escapeHtml(search)}".</div>`;
    return;
  }
  el.innerHTML = filtered.map(s => {
    const lastLog = lastLogByStudent[s.id];
    const lastDate = lastLog ? fmtDate(lastLog.date, { month: 'short', day: 'numeric' }) : '—';
    const emails = s.parent_emails || [];
    const linkedParents = emails.map(e => { const p = parents.find(p => p.email === e); return escapeHtml(p ? p.name : e); });
    const parentLabel = linkedParents.length > 0 ? linkedParents.join(', ') : '<span style="color:#737773;font-size:11px">No parent</span>';
    const lastQ = lastLog ? (lastLog.sabaq_failed ? 'Failed' : lastLog.sabaq_quality || '') : '';
    const id = Number(s.id);
    return `<div class="table-row" style="grid-template-columns:2fr 1.2fr 1fr 140px">
      <div>
        <div class="student-name">${escapeHtml(s.name)}</div>
        <div class="student-sub">${emails.length > 0 ? escapeHtml(emails.join(', ')) : 'No parent linked'}</div>
      </div>
      <div style="font-size:12px">${parentLabel}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:#737773;font-family:'IBM Plex Mono',monospace">${lastDate}</span>
        ${lastQ ? qpill(lastQ) : ''}
      </div>
      <div class="action-btns">
        <button class="row-btn" onclick="viewStudentLogs(${id})">Logs</button>
        <button class="row-btn" onclick="openEditStudentModal(${id})">Edit</button>
        <button class="row-btn" onclick="quickLog(${id})">Log</button>
        <button class="row-btn row-btn-danger" onclick="deleteStudent(${id})">✕</button>
      </div>
    </div>`;
  }).join('');
}

function populateStudentSelect() {
  const sel = document.getElementById('log-student-select');
  sel.innerHTML = '<option value="">Select student…</option>' + students.map(s => `<option value="${Number(s.id)}">${escapeHtml(s.name)}</option>`).join('');
}

// ── LOGS ────────────────────────────────────────────────────
// Three small queries instead of one capped list, so stats stay right as the school grows:
// recent sessions for the Logs tab, this week's sessions for the stats, and each student's latest session.
async function loadLogs() {
  const ids = students.map(s => s.id);
  if (ids.length === 0) { recentLogs = []; weekLogs = []; lastLogByStudent = {}; renderStudents(); renderLogs(); updateStats(); return; }
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const [recent, week, latest] = await Promise.all([
    db.from('progress_logs').select('*,students(name)').in('student_id', ids).order('date', { ascending: false }).limit(RECENT_LOG_LIMIT),
    db.from('progress_logs').select('student_id,date,sabaq_lines').in('student_id', ids).gte('date', localDateStr(weekAgo)),
    db.rpc('latest_logs', { p_student_ids: ids }),
  ]);
  recentLogs = recent.data || [];
  weekLogs = week.data || [];
  lastLogByStudent = {};
  (latest.data || []).forEach(l => { lastLogByStudent[l.student_id] = l; });
  renderStudents(); renderLogs(); updateStats();
}

function renderLogs() {
  const el = document.getElementById('logs-list');
  if (recentLogs.length === 0) { el.innerHTML = `<div class="empty-state"><div class="big">📝</div>No logs yet. Log a student's progress to get started.</div>`; return; }
  const grouped = {};
  recentLogs.forEach(l => { const n = l.students?.name || 'Unknown'; (grouped[n] = grouped[n] || []).push(l); });
  const sortedNames = Object.keys(grouped).sort();
  const note = recentLogs.length >= RECENT_LOG_LIMIT
    ? `<div style="padding:8px 16px;font-size:11px;color:#737773">Showing the latest ${RECENT_LOG_LIMIT} sessions. Use "Logs" on a student for their full history.</div>` : '';
  el.innerHTML = note + sortedNames.map((name, idx) => {
    const sLogs = grouped[name]; const latest = sLogs[0];
    const rows = sLogs.map(l => `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;padding:10px 16px;border-bottom:1px solid #f4f3ef;font-size:12px">
        <div style="color:#737773;font-family:'IBM Plex Mono',monospace;font-size:11px">${fmtDate(l.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div>${l.sabaq_lines ? `${Number(l.sabaq_lines)} lines` : '—'} ${failedOr(l.sabaq_failed, l.sabaq_quality)}</div>
        <div>${escapeHtml(sabqiText(l))} ${failedOr(l.sabqi_failed, l.sabqi_quality)}</div>
        <div>${escapeHtml(manzilText(l))} ${failedOr(l.manzil_failed, l.manzil_quality)}</div>
        <div>${qpill(l.behavior)} <span style="color:#737773;font-size:11px;margin-left:4px">${escapeHtml(l.teacher_notes || '')}</span></div>
      </div>`).join('');
    return `<div style="border-bottom:1px solid #eceae5">
      <div onclick="toggleGroup(${idx})" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer;background:#fafaf7;user-select:none">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-weight:600;font-size:13px">${escapeHtml(name)}</span>
          <span style="font-size:11px;color:#737773">${sLogs.length} session${sLogs.length !== 1 ? 's' : ''}</span>
          <span style="font-size:11px;color:#737773">Last: ${fmtDate(latest.date, { month: 'short', day: 'numeric' })}</span>
          ${failedOr(latest.sabaq_failed, latest.sabaq_quality)}
        </div>
        <span id="chev-${idx}" style="color:#737773;font-size:12px;transition:transform 0.2s">▼</span>
      </div>
      <div id="grp-${idx}" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;padding:8px 16px;background:#f4f3ef;border-bottom:1px solid #eceae5;font-size:10px;color:#737773;text-transform:uppercase;letter-spacing:0.3px;font-weight:500">
          <div>Date</div><div>Sabaq</div><div>Sabqi</div><div>Manzil</div><div>Behavior</div>
        </div>
        ${rows}
      </div>
    </div>`;
  }).join('');
}

function toggleGroup(idx) {
  const el = document.getElementById(`grp-${idx}`), chev = document.getElementById(`chev-${idx}`);
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  chev.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function updateStats() {
  document.getElementById('stat-students').textContent = students.length;
  const today = todayStr();
  const todayCount = weekLogs.filter(l => l.date === today).length;
  document.getElementById('stat-logs').textContent = todayCount;
  const weekLines = weekLogs.reduce((s, l) => s + (l.sabaq_lines || 0), 0);
  document.getElementById('stat-avg').textContent = students.length > 0 ? (weekLines / students.length).toFixed(1) : '0';
  document.getElementById('stat-week').textContent = weekLogs.length;
  const badge = document.getElementById('nav-badge-logs');
  if (todayCount > 0) { badge.textContent = todayCount + ' today'; badge.style.display = 'inline'; }
  else badge.style.display = 'none';
}

// ── INVITE CODE ──────────────────────────────────────────────
async function loadInviteCode() {
  if (currentOrg.invite_code) { document.getElementById('invite-code-display').textContent = currentOrg.invite_code; return; }
  const code = generateInviteCode();
  const { error } = await db.from('organizations').update({ invite_code: code }).eq('id', currentUser.org_id);
  if (!error) { currentOrg.invite_code = code; document.getElementById('invite-code-display').textContent = code; }
}
async function regenerateInviteCode() {
  if (!confirm('Generate a new invite code? The old code will stop working.')) return;
  const code = generateInviteCode();
  const { error } = await db.from('organizations').update({ invite_code: code }).eq('id', currentUser.org_id);
  if (error) { alert('Could not change the code: ' + error.message); return; }
  currentOrg.invite_code = code;
  document.getElementById('invite-code-display').textContent = code;
}
function flashInviteBanner() { const b = document.getElementById('invite-banner'); if (!b) return; b.style.borderColor = '#10b981'; b.style.transition = 'border-color 0.2s'; setTimeout(() => { b.style.borderColor = ''; }, 1500); }
function copyWithFeedback(text, btn, label) {
  navigator.clipboard.writeText(text).then(() => {
    flashInviteBanner();
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = label, 2000); }
  }).catch(() => prompt('Copy this:', text));
}
function copyInviteCode(e) { copyWithFeedback(document.getElementById('invite-code-display').textContent, (e || window.event)?.target, 'Copy Code'); }
function copyJoinLink(e) {
  const code = document.getElementById('invite-code-display').textContent;
  copyWithFeedback(`${BASE}/join.html?code=${encodeURIComponent(code)}`, (e || window.event)?.target, 'Copy Join Link');
}

// ── MODALS ──────────────────────────────────────────────────
function openAddStudentModal() { document.getElementById('add-student-modal').style.display = 'flex'; document.getElementById('new-student-name').focus(); }
function openLogModal() { document.getElementById('log-modal').style.display = 'flex'; }
function openCancelModal() { document.getElementById('cancel-modal').style.display = 'flex'; }
function openChangePasswordModal() { document.getElementById('change-password-modal').style.display = 'flex'; document.getElementById('cp-new-password').focus(); }
function quickLog(id) { openLogModal(); document.getElementById('log-student-select').value = id; }

function openEditStudentModal(id) {
  const s = students.find(st => st.id === id); if (!s) return;
  document.getElementById('edit-student-id').value = s.id;
  document.getElementById('edit-student-name').value = s.name;
  parentCheckboxes('edit-student-parents-list', s.parent_emails || []);
  document.getElementById('edit-student-modal').style.display = 'flex';
  document.getElementById('edit-student-name').focus();
}

async function viewStudentLogs(studentId) {
  const s = students.find(st => st.id === studentId); if (!s) return;
  document.getElementById('student-logs-modal').style.display = 'flex';
  document.getElementById('student-logs-title').textContent = s.name;
  document.getElementById('student-logs-sub').textContent = `All sessions for ${s.name}`;
  const content = document.getElementById('student-logs-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  const { data } = await db.from('progress_logs').select('*').eq('student_id', studentId).order('date', { ascending: false });
  const sLogs = data || [];
  if (sLogs.length === 0) { content.innerHTML = '<div class="empty-state"><div class="big">📝</div>No logs yet for this student.</div>'; return; }
  const box = (title, amount, failed, q) => `<div style="background:#fafaf9;border:1px solid #eceae5;border-radius:6px;padding:8px 10px">
      <div style="font-size:10px;text-transform:uppercase;color:#737773;font-weight:600;margin-bottom:4px">${title}</div>
      <div style="font-size:12px;font-weight:500">${escapeHtml(amount)}</div>
      <div style="margin-top:3px">${failedOr(failed, q)}</div>
    </div>`;
  content.innerHTML = sLogs.map(l => `<div style="padding:14px 0;border-bottom:1px solid #eceae5">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:12px;font-weight:600">${fmtDate(l.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
        ${qpill(l.behavior)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        ${box('Sabaq', l.sabaq_lines ? `${l.sabaq_lines} lines` : '—', l.sabaq_failed, l.sabaq_quality)}
        ${box('Sabqi', sabqiText(l), l.sabqi_failed, l.sabqi_quality)}
        ${box('Manzil', manzilText(l), l.manzil_failed, l.manzil_quality)}
      </div>
      ${l.teacher_notes ? `<div style="margin-top:8px;background:#fffbeb;border:1px solid #fef3c7;border-radius:6px;padding:8px 10px;font-size:12px;color:#3a3f3c;line-height:1.5"><span style="font-size:10px;color:#b45309;font-weight:600;text-transform:uppercase;display:block;margin-bottom:2px">Note</span>${escapeHtml(l.teacher_notes)}</div>` : ''}
    </div>`).join('');
}

function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.error-box,.success-box').forEach(el => { if (el.closest('.modal-overlay')) el.style.display = 'none'; });
  ['new-student-name', 'log-sabaq-lines', 'log-sabqi-juz', 'log-sabqi-pages', 'log-manzil-count', 'log-manzil-juz', 'log-notes', 'cancel-confirm', 'cp-new-password', 'cp-new-password2', 'edit-student-name', 'new-parent-name', 'new-parent-email'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelectorAll('#new-student-parents-list input[type=checkbox],#edit-student-parents-list input[type=checkbox]').forEach(cb => cb.checked = false);
  Object.keys(qualityState).forEach(k => qualityState[k] = null);
  manzilFraction = null;
  document.querySelectorAll('.quality-btn').forEach(b => b.className = 'quality-btn');
}

function showErr(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.style.display = 'block'; }
function busy(btn, on, label) { if (!btn) return; btn.disabled = on; if (label) btn.textContent = label; }

async function addStudent() {
  const name = document.getElementById('new-student-name').value.trim();
  const parentEmails = Array.from(document.querySelectorAll('#new-student-parents-list input[type=checkbox]:checked')).map(cb => cb.value.toLowerCase());
  if (!name) { showErr('add-student-error', 'Please enter a student name.'); return; }
  const { error } = await db.from('students').insert({ name, parent_emails: parentEmails, org_id: currentUser.org_id });
  if (error) { showErr('add-student-error', error.message); return; }
  closeModals(); await loadStudents(); await loadLogs();
}

async function saveEditStudent() {
  const id = parseInt(document.getElementById('edit-student-id').value);
  const name = document.getElementById('edit-student-name').value.trim();
  const parentEmails = Array.from(document.querySelectorAll('#edit-student-parents-list input[type=checkbox]:checked')).map(cb => cb.value.toLowerCase());
  if (!name) { showErr('edit-student-error', 'Please enter a student name.'); return; }
  const { error } = await db.from('students').update({ name, parent_emails: parentEmails }).eq('id', id);
  if (error) { showErr('edit-student-error', error.message); return; }
  closeModals(); await loadStudents(); await loadLogs();
}

// Parent gets an email from Supabase with a link to set their own password. No passwords are shown or stored.
async function addParentManually() {
  const name = document.getElementById('new-parent-name').value.trim();
  const email = document.getElementById('new-parent-email').value.trim().toLowerCase();
  const btn = document.getElementById('add-parent-btn');
  document.getElementById('add-parent-error').style.display = 'none';
  if (!name || !email) { showErr('add-parent-error', 'Please fill in both fields.'); return; }
  busy(btn, true, 'Sending invite…');
  const { error } = await callFunction('account', { action: 'invite_parent', name, email });
  busy(btn, false, 'Add Parent');
  if (error) { showErr('add-parent-error', error); return; }
  closeModals();
  alert(`Invite sent to ${email}.\n\nThey'll get an email with a link to set their password.`);
  await loadParents(); renderStudents();
}

async function removeParent(id) {
  const p = parents.find(x => x.id === id); if (!p) return;
  if (!confirm(`Remove ${p.name}? Their login is deleted and their students are unlinked. Student records stay.`)) return;
  const { error } = await callFunction('account', { action: 'remove_parent', email: p.email });
  if (error) { alert('Could not remove parent: ' + error); return; }
  await loadParents(); await loadStudents();
}

async function submitLog() {
  const studentId = parseInt(document.getElementById('log-student-select').value);
  const date = document.getElementById('log-date').value;
  const btn = document.getElementById('log-submit-btn');
  if (!studentId) { showErr('log-error', 'Please select a student.'); return; }
  if (!date) { showErr('log-error', 'Please select a date.'); return; }
  const failed = t => qualityState[t] === 'Failed';
  const quality = t => failed(t) ? null : qualityState[t];
  const intOrNull = id => { const n = parseInt(document.getElementById(id).value); return Number.isFinite(n) ? n : null; };
  const textOrNull = id => document.getElementById(id).value.trim() || null;
  busy(btn, true);
  const { data: log, error } = await db.from('progress_logs').insert({
    student_id: studentId, date,
    sabaq_lines: intOrNull('log-sabaq-lines'), sabaq_quality: quality('sabaq'), sabaq_failed: failed('sabaq'),
    sabqi_juz: textOrNull('log-sabqi-juz'), sabqi_pages: intOrNull('log-sabqi-pages'), sabqi_quality: quality('sabqi'), sabqi_failed: failed('sabqi'),
    manzil_fraction: manzilFraction, manzil_juz: textOrNull('log-manzil-juz'), manzil_pages: intOrNull('log-manzil-count'),
    manzil_quality: quality('manzil'), manzil_failed: failed('manzil'),
    behavior: qualityState.behavior, teacher_notes: textOrNull('log-notes'),
  }).select('id').single();
  busy(btn, false);
  if (error) { showErr('log-error', error.message); return; }

  // Email linked parents. The server reads the saved log, so the email always matches what was saved.
  const student = students.find(s => s.id === studentId);
  if (student?.parent_emails?.length && log?.id != null) {
    callFunction('send-notification', { log_id: log.id }).then(r => { if (r.error) console.warn('Parent email not sent:', r.error); });
  }
  closeModals(); await loadLogs();
}

async function deleteStudent(id) {
  const s = students.find(st => st.id === id); if (!s) return;
  if (!confirm(`Remove ${s.name}? This will also delete all their progress logs.`)) return;
  const { error } = await db.from('students').delete().eq('id', id);
  if (error) { alert('Could not delete: ' + error.message); return; }
  await loadStudents(); await loadLogs();
}

async function changePassword() {
  const pw = document.getElementById('cp-new-password').value, pw2 = document.getElementById('cp-new-password2').value;
  const btn = document.getElementById('cp-btn'), errEl = document.getElementById('cp-error'), sucEl = document.getElementById('cp-success');
  if (pw.length < 8) { showErr('cp-error', 'Password must be at least 8 characters.'); return; }
  if (pw !== pw2) { showErr('cp-error', 'Passwords do not match.'); return; }
  busy(btn, true, 'Saving…'); errEl.style.display = 'none'; sucEl.style.display = 'none';
  const { error } = await db.auth.updateUser({ password: pw });
  busy(btn, false, 'Update Password');
  if (error) showErr('cp-error', error.message);
  else { sucEl.textContent = 'Password updated successfully!'; sucEl.style.display = 'block'; document.getElementById('cp-new-password').value = ''; document.getElementById('cp-new-password2').value = ''; }
}

// Cancels Stripe billing on the server, then deactivates the school.
async function cancelSubscription() {
  const val = document.getElementById('cancel-confirm').value.trim();
  const errEl = document.getElementById('cancel-error'), sucEl = document.getElementById('cancel-success'), btn = document.getElementById('cancel-btn');
  errEl.style.display = 'none';
  if (val !== 'CANCEL') { showErr('cancel-error', 'Please type CANCEL to confirm.'); return; }
  busy(btn, true, 'Processing…');
  const { error } = await callFunction('account', { action: 'cancel_subscription' });
  if (error) { showErr('cancel-error', error); busy(btn, false, 'Deactivate Account'); return; }
  sucEl.textContent = 'Subscription cancelled. Billing has stopped. Signing you out…'; sucEl.style.display = 'block';
  setTimeout(async () => { await db.auth.signOut(); window.location.href = BASE + '/index.html'; }, 2500);
}

async function signOut() { await db.auth.signOut(); window.location.href = BASE + '/index.html'; }

document.querySelectorAll('.modal-overlay').forEach(el => { el.addEventListener('click', e => { if (e.target === el) closeModals(); }); });
init();
