const SUPABASE_URL='https://fdibhjmbabdcphldnvmq.supabase.co';
const SUPABASE_KEY='sb_publishable_DErpFcOi5m4LMgkVYFP5Kg_6fhVxHqG';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const BASE='https://propel-paradise.github.io/Quran-Journey';

let currentUser=null,students=[],activeStudent=null,allStudentLogs=[];
const redirectBase=()=>BASE+'/';

// Returns YYYY-MM-DD in local time — never use toISOString() for date comparisons
function localDateStr(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
const todayStr=()=>localDateStr(new Date());

function pill(kind,text){const m={success:{bg:'#ecfdf5',c:'#047857'},warn:{bg:'#fffbeb',c:'#b45309'},danger:{bg:'#fef2f2',c:'#b91c1c'},neutral:{bg:'#f4f3ef',c:'#3a3f3c'}};const t=m[kind]||m.neutral;return `<span class="pill" style="background:${t.bg};color:${t.c}">${text}</span>`;}
function qpill(q){if(!q)return'';if(q==='Excellent')return pill('success',q);if(q==='Good')return pill('warn',q);if(q==='Failed')return`<span class="pill pill-danger" style="font-weight:600">Failed</span>`;return pill('danger',q);}

async function init(){
  const{data:{session}}=await db.auth.getSession();
  if(!session){window.location.href=BASE+'/index.html';return;}
  const{data:u}=await db.from('users').select('*').eq('email',session.user.email).single();
  if(!u||u.role!=='parent'){
    await db.auth.signOut();
    window.location.href=BASE+'/index.html';return;
  }
  if(!u.is_active){
    await db.auth.signOut();
    window.location.href=BASE+'/index.html';return;
  }
  if(u.must_change_password){window.location.href=BASE+'/change-password.html';return;}
  currentUser=u;
  const initials=u.name.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('parent-avatar').textContent=initials;
  document.getElementById('parent-name-display').textContent=u.name;
  document.getElementById('parent-email-display').textContent=session.user.email;
  await loadStudents();
}

const childColors=['#f59e0b','#0ea5e9','#10b981','#8b5cf6','#ef4444'];

async function loadStudents(){
  const{data}=await db.from('students').select('*').contains('parent_emails',[currentUser.email]).order('name');
  students=data||[];
  const cl=document.getElementById('child-list');
  if(students.length===0){
    cl.innerHTML='<div style="font-size:11px;color:#6b716d;line-height:1.5">No students linked yet.<br>Ask your school to link your account.</div>';
    document.getElementById('no-student').style.display='flex';
    return;
  }
  cl.innerHTML=students.map((s,i)=>`
    <div class="child-row" id="child-row-${s.id}" style="opacity:${i===0?1:0.55}" onclick="selectStudent(${s.id})">
      <div class="child-avatar" style="background:${childColors[i%childColors.length]}">${s.name.split(' ').map(p=>p[0]).join('').slice(0,2)}</div>
      <div style="flex:1;min-width:0">
        <div class="child-name">${s.name.split(' ')[0]}</div>
        <div class="child-meta">${s.name}</div>
      </div>
      <span id="child-dot-${s.id}" style="width:6px;height:6px;border-radius:50%;background:#fbbf24;flex-shrink:0;display:${i===0?'block':'none'}"></span>
    </div>`).join('');
  if(students.length>0)selectStudent(students[0].id);
}

async function selectStudent(id){
  activeStudent=students.find(s=>s.id===id);
  if(!activeStudent)return;

  // Update sidebar
  students.forEach((s,i)=>{
    const row=document.getElementById(`child-row-${s.id}`);const dot=document.getElementById(`child-dot-${s.id}`);
    if(row)row.style.opacity=s.id===id?'1':'0.55';
    if(dot)dot.style.display=s.id===id?'block':'none';
  });

  // Only show student-content if we're on the progress tab
  const activeTab = ['sessions','settings'].find(t => document.getElementById('nav-'+t)?.classList.contains('active')) || 'progress';
  document.getElementById('no-student').style.display = 'none';
  if (activeTab === 'progress') {
    document.getElementById('student-content').style.display = 'block';
  } else if (activeTab === 'sessions') {
    document.getElementById('tab-sessions').style.display = 'flex';
    document.getElementById('student-content').style.display = 'none';
  } else if (activeTab === 'settings') {
    document.getElementById('tab-settings').style.display = 'flex';
    document.getElementById('student-content').style.display = 'none';
  }
  document.getElementById('logs-list').innerHTML='<div class="loading">Loading…</div>';

  const idx=students.findIndex(s=>s.id===id);
  const color=childColors[idx%childColors.length];
  const initials=activeStudent.name.split(' ').map(p=>p[0]).join('').slice(0,2);
  document.getElementById('hero-avatar').textContent=initials;
  document.getElementById('hero-avatar').style.background=`linear-gradient(135deg,${color},${color}aa)`;
  document.getElementById('hero-name').textContent=activeStudent.name;
  document.getElementById('topbar-child').textContent=activeStudent.name;

  const{data:logs}=await db.from('progress_logs').select('*').eq('student_id',id).order('date',{ascending:false});
  const allLogs=logs||[];

  document.getElementById('stat-sessions').textContent=allLogs.length;

  if(allLogs.length>0){
    const last=allLogs[0];
    const lastDate=new Date(last.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
    document.getElementById('stat-last').textContent=lastDate;
    document.getElementById('stat-last-sub').textContent=last.sabaq_lines?`${last.sabaq_lines} lines sabaq`:'Session logged';
    document.getElementById('last-updated').textContent=`Last updated ${lastDate}`;
  } else {
    document.getElementById('stat-last').textContent='—';document.getElementById('stat-last-sub').textContent='no logs yet';document.getElementById('last-updated').textContent='';
  }

  // Behavior this week
  const weekAgo=new Date();weekAgo.setDate(weekAgo.getDate()-7);
  const weekBehavior=allLogs.filter(l=>new Date(l.date+'T12:00:00')>=weekAgo&&l.behavior).map(l=>l.behavior);
  const behaviorEl=document.getElementById('stat-behavior');
  if(weekBehavior.length>0){
    const sm={Excellent:3,Good:2,'Needs Work':1};
    const avg=weekBehavior.reduce((s,b)=>s+(sm[b]||0),0)/weekBehavior.length;
    const bval=avg>=2.5?'Excellent':avg>=1.5?'Good':'Needs Work';
    behaviorEl.textContent=bval;
    const bcolor={Excellent:'#047857',Good:'#b45309','Needs Work':'#b91c1c'}[bval];
    behaviorEl.style.color=bcolor;
  } else {behaviorEl.textContent='—';behaviorEl.style.color='';}

  // Weekly streak strip
  const weekDays=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);weekDays.push(d);}
  const strip=document.getElementById('week-strip');
  strip.innerHTML=weekDays.map(d=>{
    const dStr=localDateStr(d);
    const isToday=dStr===todayStr();
    const hasLog=allLogs.some(l=>l.date===dStr);
    const dayLabel=['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
    let bg,color,border;
    if(isToday){bg='#0b0f0d';color='#fff';border='none';}
    else if(hasLog){bg='#ecfdf5';color='#047857';border='1px solid #6ee7b7';}
    else{bg='#fafaf9';color='#9b9892';border='1px solid #eceae5';}
    return `<div class="day-pill" style="background:${bg};color:${color};border:${border||'none'}"><span>${dayLabel}</span><span style="font-size:9px">${d.getDate()}</span></div>`;
  }).join('');

  renderLogs(allLogs);

  // If sessions tab is active, refresh it too
  if (activeTab === 'sessions') renderSessionsTab();
  else if (activeTab === 'settings') loadSettingsTab();
}

function renderLogs(logs){
  const el=document.getElementById('logs-list');
  if(logs.length===0){el.innerHTML=`<div class="empty-state"><div class="big">📝</div>No progress logged yet. Check back after the next session.</div>`;return;}
  el.innerHTML=logs.map(l=>{
    const dateStr=new Date(l.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    const sabaqFailed=l.sabaq_failed||l.sabaq_quality==='Failed';
    const sabqiFailed=l.sabqi_failed||l.sabqi_quality==='Failed';
    const manzilFailed=l.manzil_failed||l.manzil_quality==='Failed';
    const sabaqVal=[l.sabaq_lines?`${l.sabaq_lines} lines`:null].filter(Boolean).join(' · ')||'—';
    const sabqiVal=[l.sabqi_juz?`Juz ${l.sabqi_juz}`:null,l.sabqi_pages?`${l.sabqi_pages}p`:null].filter(Boolean).join(' · ')||'—';
    const manzilVal=[l.manzil_pages!=null?`${l.manzil_pages}${l.manzil_fraction?' '+l.manzil_fraction:''} Juz`:(l.manzil_fraction?l.manzil_fraction+' Juz':null),l.manzil_juz].filter(Boolean).join(' · ')||'—';
    return `<div class="log-block">
      <div class="log-date">${dateStr}</div>
      <div class="log-grid">
        <div class="log-section${sabaqFailed?' log-section-failed':''}">
          <div class="log-section-title">Sabaq</div>
          <div class="log-section-val">${sabaqVal}</div>
          <div style="margin-top:3px">${sabaqFailed?'<span class="pill pill-danger" style="font-weight:600">Failed</span>':qpill(l.sabaq_quality)}</div>
        </div>
        <div class="log-section${sabqiFailed?' log-section-failed':''}">
          <div class="log-section-title">Sabqi</div>
          <div class="log-section-val">${sabqiVal}</div>
          <div style="margin-top:3px">${sabqiFailed?'<span class="pill pill-danger" style="font-weight:600">Failed</span>':qpill(l.sabqi_quality)}</div>
        </div>
        <div class="log-section${manzilFailed?' log-section-failed':''}">
          <div class="log-section-title">Manzil</div>
          <div class="log-section-val">${manzilVal}</div>
          <div style="margin-top:3px">${manzilFailed?'<span class="pill pill-danger" style="font-weight:600">Failed</span>':qpill(l.manzil_quality)}</div>
        </div>
        <div class="log-section">
          <div class="log-section-title">Behavior</div>
          <div class="log-section-val">${l.behavior?qpill(l.behavior):'<span style="color:#737773">—</span>'}</div>
        </div>
      </div>
      ${l.teacher_notes?`<div class="log-notes"><span class="log-notes-label">Teacher's Note</span>${l.teacher_notes}</div>`:''}
    </div>`;
  }).join('');
}

function openCpModal(){document.getElementById('cp-modal').style.display='flex';document.getElementById('cp-pw').focus();}
function closeCpModal(){document.getElementById('cp-modal').style.display='none';document.getElementById('cp-pw').value='';document.getElementById('cp-pw2').value='';document.getElementById('cp-error').style.display='none';document.getElementById('cp-success').style.display='none';}
async function savePassword(){
  const pw=document.getElementById('cp-pw').value,pw2=document.getElementById('cp-pw2').value;
  const btn=document.getElementById('cp-btn'),errEl=document.getElementById('cp-error'),sucEl=document.getElementById('cp-success');
  if(pw.length<8){errEl.textContent='Password must be at least 8 characters.';errEl.style.display='block';return;}
  if(pw!==pw2){errEl.textContent='Passwords do not match.';errEl.style.display='block';return;}
  btn.disabled=true;btn.textContent='Saving…';errEl.style.display='none';sucEl.style.display='none';
  const{error}=await db.auth.updateUser({password:pw});
  btn.disabled=false;btn.textContent='Update Password';
  if(error){errEl.textContent=error.message;errEl.style.display='block';}
  else{sucEl.textContent='Password updated!';sucEl.style.display='block';document.getElementById('cp-pw').value='';document.getElementById('cp-pw2').value='';}
}
document.getElementById('cp-modal').addEventListener('click',e=>{if(e.target===document.getElementById('cp-modal'))closeCpModal();});

async function signOut() { await db.auth.signOut(); window.location.href = BASE + '/index.html'; }

function switchTab(tab, btn) {
  // Update nav
  ['progress','sessions','settings'].forEach(t => {
    const el = document.getElementById('nav-' + t);
    if (el) el.className = 'nav-item' + (t === tab ? ' active' : '');
  });
  // Update topbar
  const labels = {progress:'Progress', sessions:'Sessions', settings:'Settings'};
  document.getElementById('topbar-page').textContent = labels[tab] || tab;
  // Show/hide content
  const studentContent = document.getElementById('student-content');
  const noStudent = document.getElementById('no-student');
  const tabSessions = document.getElementById('tab-sessions');
  const tabSettings = document.getElementById('tab-settings');
  studentContent.style.display = 'none';
  noStudent.style.display = 'none';
  tabSessions.style.display = 'none';
  tabSettings.style.display = 'none';
  if (tab === 'progress') {
    if (activeStudent) studentContent.style.display = 'block';
    else noStudent.style.display = 'flex';
  } else if (tab === 'sessions') {
    tabSessions.style.display = 'flex';
    renderSessionsTab();
  } else if (tab === 'settings') {
    tabSettings.style.display = 'flex';
    loadSettingsTab();
  }
}

async function renderSessionsTab() {
  const noStu = document.getElementById('sessions-no-student');
  const content = document.getElementById('sessions-content');
  if (!activeStudent) { noStu.style.display = 'block'; content.style.display = 'none'; return; }
  noStu.style.display = 'none'; content.style.display = 'block';
  document.getElementById('sessions-list').innerHTML = '<div class="loading">Loading…</div>';

  const { data: logs } = await db.from('progress_logs').select('*').eq('student_id', activeStudent.id).order('date', { ascending: false });
  const allLogs = logs || [];

  // ── Summary cards ──────────────────────────────────────────────
  const totalSessions = allLogs.length;
  const totalLines = allLogs.reduce((s, l) => s + (l.sabaq_lines || 0), 0);
  const avgLines = totalSessions > 0 ? (totalLines / totalSessions).toFixed(1) : '—';
  const thisMonth = allLogs.filter(l => {
    const d = new Date(l.date+'T12:00:00'); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const excellentCount = allLogs.filter(l => l.sabaq_quality === 'Excellent').length;
  const excellentPct = totalSessions > 0 ? Math.round((excellentCount / totalSessions) * 100) : 0;

  document.getElementById('sessions-summary-cards').innerHTML = [
    { label: 'Total Sessions', val: totalSessions, sub: 'all time' },
    { label: 'This Month', val: thisMonth, sub: 'sessions logged' },
    { label: 'Avg Lines / Session', val: avgLines, sub: 'sabaq lines' },
    { label: 'Sabaq Quality', val: excellentPct + '%', sub: 'excellent sessions' },
  ].map(c => `
    <div style="background:#fff;border:1px solid #eceae5;border-radius:10px;padding:16px 18px">
      <div style="font-size:11px;color:#737773;text-transform:uppercase;letter-spacing:0.3px;font-weight:500">${c.label}</div>
      <div style="font-size:26px;font-weight:600;letter-spacing:-0.5px;margin-top:6px">${c.val}</div>
      <div style="font-size:11px;color:#737773;margin-top:3px">${c.sub}</div>
    </div>`).join('');

  // ── 30-day calendar ─────────────────────────────────────────────
  const days = []; for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const logDates = new Set(allLogs.map(l => l.date));
  // Current streak
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = localDateStr(d);
    if (logDates.has(ds)) streak++; else break;
  }
  document.getElementById('streak-label').textContent = streak > 0 ? `🔥 ${streak}-day streak` : 'No current streak';
  document.getElementById('calendar-strip').innerHTML = days.map(d => {
    const ds = localDateStr(d);
    const hasLog = logDates.has(ds);
    const isToday = ds === todayStr();
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
    const dayNum = d.getDate();
    return `<div title="${ds}" style="width:32px;height:42px;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:9px;font-weight:600;
      background:${isToday ? '#0b0f0d' : hasLog ? '#ecfdf5' : '#fafaf9'};
      color:${isToday ? '#fff' : hasLog ? '#047857' : '#9b9892'};
      border:1px solid ${isToday ? 'transparent' : hasLog ? '#6ee7b7' : '#eceae5'}">
      <span style="font-size:8px;opacity:0.7">${dayName}</span><span>${dayNum}</span>
    </div>`;
  }).join('');

  // ── Full table ───────────────────────────────────────────────────
  document.getElementById('sessions-count').textContent = totalSessions + ' sessions total';
  if (allLogs.length === 0) { document.getElementById('sessions-list').innerHTML = '<div class="empty-state"><div class="big">📝</div>No sessions logged yet.</div>'; return; }
  document.getElementById('sessions-list').innerHTML = allLogs.map(l => {
    const dateStr = new Date(l.date+'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const sabaqStr = l.sabaq_lines ? l.sabaq_lines + ' lines' : '—';
    const sabqiStr = [l.sabqi_juz ? 'Juz ' + l.sabqi_juz : null, l.sabqi_pages ? l.sabqi_pages + 'p' : null].filter(Boolean).join(' · ') || '—';
    const manzilStr = [l.manzil_pages != null ? l.manzil_pages + (l.manzil_fraction ? ' ' + l.manzil_fraction : '') + ' Juz' : (l.manzil_fraction ? l.manzil_fraction + ' Juz' : null), l.manzil_juz].filter(Boolean).join(' · ') || '—';
    return `<div class="table-row" style="grid-template-columns:1.2fr 1fr 1fr 1fr 1fr">
      <div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:#737773">${dateStr}</div>
      <div style="font-size:12px">${sabaqStr} ${qpill(l.sabaq_quality)}</div>
      <div style="font-size:12px">${sabqiStr} ${qpill(l.sabqi_quality)}</div>
      <div style="font-size:12px">${manzilStr} ${qpill(l.manzil_quality)}</div>
      <div style="font-size:12px">${l.behavior ? qpill(l.behavior) : '—'}</div>
    </div>`;
  }).join('');
}

async function loadSettingsTab() {
  const { data: { session } } = await db.auth.getSession();
  if (session) document.getElementById('settings-email').textContent = session.user.email;
  const list = document.getElementById('settings-children-list');
  if (students.length === 0) { list.textContent = 'No children linked to your account.'; return; }
  list.innerHTML = students.map(s => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eceae5">
      <div style="font-weight:500">${s.name}</div>

    </div>`).join('');
}

async function removeChild(id, name) {
  if (!confirm('Remove ' + name + ' from your account? Their progress records stay with the school.')) return;
  const s = students.find(st => st.id === id);
  if (!s) return;
  const updated = (s.parent_emails || []).filter(e => e !== currentUser.email);
  await db.from('students').update({ parent_emails: updated }).eq('id', id);
  students = students.filter(s => s.id !== id);
  await loadStudents();
  loadSettingsTab();
}

function openDeleteAccountModal() { document.getElementById('delete-account-modal').style.display = 'flex'; }
function closeDeleteAccountModal() { document.getElementById('delete-account-modal').style.display = 'none'; document.getElementById('da-confirm').value = ''; document.getElementById('da-error').style.display = 'none'; }

async function deleteAccount() {
  const val = document.getElementById('da-confirm').value.trim();
  const errEl = document.getElementById('da-error');
  const btn = document.getElementById('da-btn');
  if (val !== 'DELETE') { errEl.textContent = 'Please type DELETE to confirm.'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Deleting…';
  // Unlink this parent from all students
  const linked = students.filter(s => (s.parent_emails || []).includes(currentUser.email));
  for (const s of linked) {
    const updated = (s.parent_emails || []).filter(e => e !== currentUser.email);
    await db.from('students').update({ parent_emails: updated }).eq('id', s.id);
  }
  // Delete user record
  await db.from('users').delete().eq('email', currentUser.email);
  // Sign out
  await db.auth.signOut();
  window.location.href = BASE + '/index.html';
}

async function signOut(){await db.auth.signOut();window.location.href=BASE+'/index.html';}
init();
