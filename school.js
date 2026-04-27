const SUPABASE_URL='https://fdibhjmbabdcphldnvmq.supabase.co';
const SUPABASE_KEY='sb_publishable_DErpFcOi5m4LMgkVYFP5Kg_6fhVxHqG';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const BASE='https://propel-paradise.github.io/Quran-Journey';

let currentUser=null,students=[],logs=[],parents=[],generatedPassword='',manzilFraction=null;
const qualityState={sabaq:null,sabqi:null,manzil:null,behavior:null};
function localDateStr(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
const todayStr=()=>localDateStr(new Date());

function icon(name,size,color){size=size||16;color=color||'currentColor';
  const p={students:'<path d="M16 14a4 4 0 1 0-8 0"/><circle cx="12" cy="7" r="3"/>',plus:'<path d="M12 5v14M5 12h14"/>',edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',trash:'<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',logs:'<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 14h8"/>',};
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${p[name]||''}</svg>`;}

function pill(kind,text){const m={success:{bg:'#ecfdf5',c:'#047857'},warn:{bg:'#fffbeb',c:'#b45309'},danger:{bg:'#fef2f2',c:'#b91c1c'},neutral:{bg:'#f4f3ef',c:'#3a3f3c'}};const t=m[kind]||m.neutral;return `<span class="pill" style="background:${t.bg};color:${t.c}">${text}</span>`;}
function qpill(q){if(!q)return'<span style="color:#737773;font-size:11px">—</span>';if(q==='Excellent')return pill('success',q);if(q==='Good')return pill('warn',q);if(q==='Failed')return`<span class="pill" style="background:#fef2f2;color:#b91c1c;font-weight:600">Failed</span>`;return pill('danger',q);}

function setQuality(type,val){
  qualityState[type]=val;
  const prefix={sabaq:'sq',sabqi:'sqi',manzil:'mz',behavior:'bh'}[type];
  ['excellent','good','needs','failed'].forEach(k=>{const el=document.getElementById(`${prefix}-${k}`);if(el)el.className='quality-btn';});
  const keyMap={'Excellent':'excellent','Good':'good','Needs Work':'needs','Failed':'failed'};
  const el=document.getElementById(`${prefix}-${keyMap[val]}`);
  if(el)el.classList.add(val==='Failed'?'sel-failed':`sel-${keyMap[val]}`);
}

function setManzilFraction(val){
  if(manzilFraction===val){manzilFraction=null;['quarter','half','three'].forEach(k=>{const el=document.getElementById(`mz-frac-${k}`);if(el)el.className='quality-btn';});return;}
  manzilFraction=val;
  ['quarter','half','three'].forEach(k=>{const el=document.getElementById(`mz-frac-${k}`);if(el)el.className='quality-btn';});
  const km={'¼':'quarter','½':'half','¾':'three'};
  const el=document.getElementById(`mz-frac-${km[val]}`);
  if(el)el.classList.add('sel-good');
}

function switchTab(tab,btn){
  ['students','parents','logs','settings'].forEach(t=>{
    document.getElementById(`tab-${t}`).style.display=t===tab?'block':'none';
    document.getElementById(`nav-${t}`).classList.toggle('active',t===tab);
  });
  const labels={students:'Students',parents:'Parents',logs:'Progress Logs',settings:'Settings'};
  document.getElementById('topbar-page').textContent=labels[tab]||tab;
}

async function init(){
  const{data:{session}}=await db.auth.getSession();
  if(!session){window.location.href=BASE+'/index.html';return;}
  const{data:u}=await db.from('users').select('*').eq('email',session.user.email).single();
  if(!u||u.role!=='teacher'){window.location.href=BASE+'/index.html';return;}
  currentUser=u;
  const initials=u.name.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('sidebar-avatar').textContent=initials;
  document.getElementById('sidebar-name').textContent=u.name;
  document.getElementById('sidebar-email').textContent=session.user.email;
  document.getElementById('settings-email').textContent=session.user.email;
  document.getElementById('topbar-org').textContent=u.name;
  document.getElementById('log-date').value=todayStr();
  document.getElementById('stat-date').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  if(u.org_id){
    const{data:org}=await db.from('organizations').select('*').eq('id',u.org_id).single();
    if(org){
      const orgInitials=org.name.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();
      document.getElementById('org-icon-text').textContent=orgInitials;
      document.getElementById('org-name-sidebar').textContent=org.name;
      document.getElementById('settings-org-name').textContent=org.name;
      const planLabel=org.plan==='trial'?'Free Trial':org.plan==='cancelled'?'Cancelled':org.plan==='payment_failed'?'Payment Failed':'Pro';
      document.getElementById('org-plan-sidebar').textContent=planLabel;
      document.getElementById('subscription-status').textContent=org.plan==='cancelled'?'⚠️ Cancelled':'Active — '+planLabel;
      if(org.plan==='trial'){document.getElementById('trial-card').style.display='block';}
    }
  }
  await loadParents();await loadStudents();await loadLogs();await loadInviteCode();
}

async function loadParents(){
  let q=db.from('users').select('*').eq('role','parent').order('name');
  if(currentUser.org_id)q=db.from('users').select('*').eq('role','parent').eq('org_id',currentUser.org_id).order('name');
  const{data}=await q;parents=data||[];renderParents();
  const checkboxHtml=parents.length===0
    ?'<span style="font-size:12px;color:#737773">No parents registered yet.</span>'
    :parents.map(p=>`<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:2px 0">
        <input type="checkbox" value="${p.email}" style="accent-color:#10b981;width:14px;height:14px">
        <span>${p.name} <span style="color:#737773;font-family:'IBM Plex Mono',monospace;font-size:11px">${p.email}</span></span>
      </label>`).join('');
  document.getElementById('new-student-parents-list').innerHTML=checkboxHtml;
  document.getElementById('nav-count-parents').textContent=parents.length;
}

function renderParents(){
  const el=document.getElementById('parents-list');
  if(parents.length===0){el.innerHTML=`<div class="empty-state"><div class="big">👤</div>No parents yet. Share the invite code above with parents so they can register.</div>`;return;}
  el.innerHTML=parents.map(p=>{
    const linked=students.filter(s=>(s.parent_emails||[]).includes(p.email)).map(s=>s.name).join(', ')||'<span style="color:#737773">None linked</span>';
    return `<div class="table-row" style="grid-template-columns:1.5fr 1.5fr 1.5fr 80px">
      <div class="student-name">${p.name}</div>
      <div style="font-size:12px;color:#3a3f3c;font-family:'IBM Plex Mono',monospace">${p.email}</div>
      <div style="font-size:12px">${linked}</div>
      <div class="action-btns"><button class="row-btn row-btn-danger" onclick="removeParent('${p.email}','${p.name.replace(/'/g,"\\'")}')">Remove</button></div>
    </div>`;
  }).join('');
}

async function loadStudents(){
  let q=db.from('students').select('*').order('name');
  if(currentUser.org_id)q=db.from('students').select('*').eq('org_id',currentUser.org_id).order('name');
  const{data}=await q;students=data||[];renderStudents();updateStats();populateStudentSelect();
  document.getElementById('nav-count-students').textContent=students.length;
}

async function loadLogs(){
  const ids=students.map(s=>s.id);
  if(ids.length===0){logs=[];renderLogs();updateStats();return;}
  const{data}=await db.from('progress_logs').select('*,students(name)').in('student_id',ids).order('date',{ascending:false}).limit(50);
  logs=data||[];renderStudents();renderLogs();updateStats();
}

function renderStudents(){
  const el=document.getElementById('students-list');
  const search=(document.getElementById('student-search')?.value||'').toLowerCase();
  const filtered=students.filter(s=>s.name.toLowerCase().includes(search));
  if(filtered.length===0){el.innerHTML=students.length===0?`<div class="empty-state"><div class="big">📚</div>No students yet. Add your first student to get started.</div>`:`<div class="empty-state"><div class="big">🔍</div>No students match "${search}".</div>`;return;}
  el.innerHTML=filtered.map(s=>{
    const lastLog=logs.find(l=>l.student_id===s.id);
    const lastDate=lastLog?new Date(lastLog.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
    const emails=s.parent_emails||[];
    const linkedParents=emails.map(e=>{const p=parents.find(p=>p.email===e);return p?p.name:e;});
    const parentLabel=linkedParents.length>0?linkedParents.join(', '):'<span style="color:#737773;font-size:11px">No parent</span>';
    const lastQ=lastLog?(lastLog.sabaq_quality||''):'';
    const qpillHtml=lastQ?qpill(lastQ):'';
    return `<div class="table-row" style="grid-template-columns:2fr 1.2fr 1fr 140px">
      <div>
        <div class="student-name">${s.name}</div>
        <div class="student-sub">${emails.length>0?emails.join(', '):'No parent linked'}</div>
      </div>
      <div style="font-size:12px">${parentLabel}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:#737773;font-family:'IBM Plex Mono',monospace">${lastDate}</span>
        ${qpillHtml}
      </div>
      <div class="action-btns">
        <button class="row-btn" onclick="viewStudentLogs(${s.id},'${s.name.replace(/'/g,"\\'")}')">Logs</button>
        <button class="row-btn" onclick="openEditStudentModal(${s.id})">Edit</button>
        <button class="row-btn" onclick="quickLog(${s.id})">Log</button>
        <button class="row-btn row-btn-danger" onclick="deleteStudent(${s.id},'${s.name.replace(/'/g,"\\'")}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function renderLogs(){
  const el=document.getElementById('logs-list');
  if(logs.length===0){el.innerHTML=`<div class="empty-state"><div class="big">📝</div>No logs yet. Log a student's progress to get started.</div>`;return;}
  const grouped={};logs.forEach(l=>{const n=l.students?.name||'Unknown';if(!grouped[n])grouped[n]=[];grouped[n].push(l);});
  const sortedNames=Object.keys(grouped).sort();
  el.innerHTML=sortedNames.map((name,idx)=>{
    const sLogs=grouped[name];const latest=sLogs[0];
    const latestDate=new Date(latest.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const rows=sLogs.map(l=>{
      const dateStr=new Date(l.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      const sabaqStr=l.sabaq_lines?`${l.sabaq_lines} lines`:'—';
      const sabqiStr=[l.sabqi_juz?`Juz ${l.sabqi_juz}`:null,l.sabqi_pages?`${l.sabqi_pages}p`:null].filter(Boolean).join(' · ')||'—';
      const manzilStr=[l.manzil_pages!=null?`${l.manzil_pages}${l.manzil_fraction?' '+l.manzil_fraction:''} Juz`:(l.manzil_fraction?l.manzil_fraction+' Juz':null),l.manzil_juz].filter(Boolean).join(' · ')||'—';
      return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;padding:10px 16px;border-bottom:1px solid #f4f3ef;font-size:12px">
        <div style="color:#737773;font-family:'IBM Plex Mono',monospace;font-size:11px">${dateStr}</div>
        <div>${sabaqStr} ${l.sabaq_failed?pill('danger','Failed'):qpill(l.sabaq_quality)}</div>
        <div>${sabqiStr} ${l.sabqi_failed?pill('danger','Failed'):qpill(l.sabqi_quality)}</div>
        <div>${manzilStr} ${l.manzil_failed?pill('danger','Failed'):qpill(l.manzil_quality)}</div>
        <div>${qpill(l.behavior)} <span style="color:#737773;font-size:11px;margin-left:4px">${l.teacher_notes||''}</span></div>
      </div>`;
    }).join('');
    return `<div style="border-bottom:1px solid #eceae5">
      <div onclick="toggleGroup('grp-${idx}')" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer;background:#fafaf7;user-select:none">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-weight:600;font-size:13px">${name}</span>
          <span style="font-size:11px;color:#737773">${sLogs.length} session${sLogs.length!==1?'s':''}</span>
          <span style="font-size:11px;color:#737773">Last: ${latestDate}</span>
          ${qpill(latest.sabaq_quality)}
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

function toggleGroup(id){const el=document.getElementById(id);const idx=id.replace('grp-','');const chev=document.getElementById(`chev-${idx}`);const isOpen=el.style.display!=='none';el.style.display=isOpen?'none':'block';chev.style.transform=isOpen?'':'rotate(180deg)';}

function updateStats(){
  document.getElementById('stat-students').textContent=students.length;
  const today=todayStr();
  const todayLogs=logs.filter(l=>l.date===today);
  document.getElementById('stat-logs').textContent=todayLogs.length;
  const weekAgo=new Date();weekAgo.setDate(weekAgo.getDate()-7);
  const weekLogs=logs.filter(l=>new Date(l.date+'T12:00:00')>=weekAgo);
  const weekLines=weekLogs.reduce((s,l)=>s+(l.sabaq_lines||0),0);
  document.getElementById('stat-avg').textContent=students.length>0?(weekLines/students.length).toFixed(1):'0';
  document.getElementById('stat-week').textContent=weekLogs.length;
  const badge=document.getElementById('nav-badge-logs');
  if(todayLogs.length>0){badge.textContent=todayLogs.length+' today';badge.style.display='inline';}
}

function populateStudentSelect(){
  const sel=document.getElementById('log-student-select');
  sel.innerHTML='<option value="">Select student…</option>'+students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
}

// ── INVITE CODE ──────────────────────────────────────────────
function generateCode(){const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789';return Array.from({length:4},()=>c[Math.floor(Math.random()*c.length)]).join('')+'-'+Array.from({length:4},()=>c[Math.floor(Math.random()*c.length)]).join('');}
async function loadInviteCode(){if(!currentUser.org_id)return;const{data:org}=await db.from('organizations').select('invite_code').eq('id',currentUser.org_id).single();if(org&&org.invite_code){document.getElementById('invite-code-display').textContent=org.invite_code;}else{const code=generateCode();await db.from('organizations').update({invite_code:code}).eq('id',currentUser.org_id);document.getElementById('invite-code-display').textContent=code;}}
async function regenerateInviteCode(){if(!confirm('Generate a new invite code? The old code will stop working.'))return;const code=generateCode();await db.from('organizations').update({invite_code:code}).eq('id',currentUser.org_id);document.getElementById('invite-code-display').textContent=code;}
function copyInviteCode(){const code=document.getElementById('invite-code-display').textContent;navigator.clipboard.writeText(code).then(()=>{const btn=event.target;btn.textContent='✓ Copied!';setTimeout(()=>btn.textContent='Copy Code',2000);});}
function copyJoinLink(){const code=document.getElementById('invite-code-display').textContent;const url=`${BASE}/join.html?code=${encodeURIComponent(code)}`;navigator.clipboard.writeText(url).then(()=>{const btn=event.target;btn.textContent='✓ Copied!';setTimeout(()=>btn.textContent='Copy Join Link',2000);});}

// ── MODALS ──────────────────────────────────────────────────
function openAddStudentModal(){document.getElementById('add-student-modal').style.display='flex';document.getElementById('new-student-name').focus();}
function openLogModal(){document.getElementById('log-modal').style.display='flex';}
function openCancelModal(){document.getElementById('cancel-modal').style.display='flex';}
function openChangePasswordModal(){document.getElementById('change-password-modal').style.display='flex';document.getElementById('cp-new-password').focus();}
function quickLog(id){openLogModal();setTimeout(()=>{document.getElementById('log-student-select').value=id;},50);}

function openEditStudentModal(id){
  const s=students.find(st=>st.id===id);if(!s)return;
  document.getElementById('edit-student-id').value=s.id;
  document.getElementById('edit-student-name').value=s.name;
  const currentEmails=s.parent_emails||[];
  const checkboxHtml=parents.length===0
    ?'<span style="font-size:12px;color:#737773">No parents registered yet.</span>'
    :parents.map(p=>`<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:2px 0">
        <input type="checkbox" value="${p.email}"${currentEmails.includes(p.email)?' checked':''} style="accent-color:#10b981;width:14px;height:14px">
        <span>${p.name} <span style="color:#737773;font-family:'IBM Plex Mono',monospace;font-size:11px">${p.email}</span></span>
      </label>`).join('');
  document.getElementById('edit-student-parents-list').innerHTML=checkboxHtml;
  document.getElementById('edit-student-modal').style.display='flex';
  document.getElementById('edit-student-name').focus();
}

async function viewStudentLogs(studentId,studentName){
  document.getElementById('student-logs-modal').style.display='flex';
  document.getElementById('student-logs-title').textContent=studentName;
  document.getElementById('student-logs-sub').textContent=`All sessions for ${studentName}`;
  document.getElementById('student-logs-content').innerHTML='<div class="loading">Loading…</div>';
  const{data}=await db.from('progress_logs').select('*').eq('student_id',studentId).order('date',{ascending:false});
  const sLogs=data||[];
  if(sLogs.length===0){document.getElementById('student-logs-content').innerHTML='<div class="empty-state"><div class="big">📝</div>No logs yet for this student.</div>';return;}
  document.getElementById('student-logs-content').innerHTML=sLogs.map(l=>{
    const dateStr=new Date(l.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    const sabaqStr=l.sabaq_lines?`${l.sabaq_lines} lines`:'—';
    const sabqiStr=[l.sabqi_juz?`Juz ${l.sabqi_juz}`:null,l.sabqi_pages?`${l.sabqi_pages}p`:null].filter(Boolean).join(' · ')||'—';
    const manzilStr=[l.manzil_pages!=null?`${l.manzil_pages}${l.manzil_fraction?' '+l.manzil_fraction:''} Juz`:(l.manzil_fraction?l.manzil_fraction+' Juz':null),l.manzil_juz].filter(Boolean).join(' · ')||'—';
    return `<div style="padding:14px 0;border-bottom:1px solid #eceae5">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:12px;font-weight:600">${dateStr}</span>
        ${qpill(l.behavior)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="background:#fafaf9;border:1px solid #eceae5;border-radius:6px;padding:8px 10px">
          <div style="font-size:10px;text-transform:uppercase;color:#737773;font-weight:600;margin-bottom:4px">Sabaq</div>
          <div style="font-size:12px;font-weight:500">${sabaqStr}</div>
          <div style="margin-top:3px">${l.sabaq_failed?pill('danger','Failed'):qpill(l.sabaq_quality)}</div>
        </div>
        <div style="background:#fafaf9;border:1px solid #eceae5;border-radius:6px;padding:8px 10px">
          <div style="font-size:10px;text-transform:uppercase;color:#737773;font-weight:600;margin-bottom:4px">Sabqi</div>
          <div style="font-size:12px;font-weight:500">${sabqiStr}</div>
          <div style="margin-top:3px">${l.sabqi_failed?pill('danger','Failed'):qpill(l.sabqi_quality)}</div>
        </div>
        <div style="background:#fafaf9;border:1px solid #eceae5;border-radius:6px;padding:8px 10px">
          <div style="font-size:10px;text-transform:uppercase;color:#737773;font-weight:600;margin-bottom:4px">Manzil</div>
          <div style="font-size:12px;font-weight:500">${manzilStr}</div>
          <div style="margin-top:3px">${l.manzil_failed?pill('danger','Failed'):qpill(l.manzil_quality)}</div>
        </div>
      </div>
      ${l.teacher_notes?`<div style="margin-top:8px;background:#fffbeb;border:1px solid #fef3c7;border-radius:6px;padding:8px 10px;font-size:12px;color:#3a3f3c;line-height:1.5"><span style="font-size:10px;color:#b45309;font-weight:600;text-transform:uppercase;display:block;margin-bottom:2px">Note</span>${l.teacher_notes}</div>`:''}
    </div>`;
  }).join('');
}

function closeModals(){
  document.querySelectorAll('.modal-overlay').forEach(el=>el.style.display='none');
  document.querySelectorAll('.error-box').forEach(el=>el.style.display='none');
  ['new-student-name','log-sabaq-lines','log-sabqi-juz','log-sabqi-pages','log-manzil-count','log-manzil-juz','log-notes','cancel-confirm','cp-new-password','cp-new-password2','edit-student-name'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.querySelectorAll('#new-student-parents-list input[type=checkbox],#edit-student-parents-list input[type=checkbox]').forEach(cb=>cb.checked=false);
  Object.keys(qualityState).forEach(k=>qualityState[k]=null);
  manzilFraction=null;
  document.querySelectorAll('.quality-btn').forEach(b=>b.className='quality-btn');
  generatedPassword='';
}

async function addStudent(){
  const name=document.getElementById('new-student-name').value.trim();
  const parentEmails=Array.from(document.querySelectorAll('#new-student-parents-list input[type=checkbox]:checked')).map(cb=>cb.value);
  const errEl=document.getElementById('add-student-error');
  if(!name){errEl.textContent='Please enter a student name.';errEl.style.display='block';return;}
  const payload={name,parent_emails:parentEmails};
  if(currentUser.org_id)payload.org_id=currentUser.org_id;
  const{error}=await db.from('students').insert(payload);
  if(error){errEl.textContent=error.message;errEl.style.display='block';return;}
  closeModals();await loadStudents();await loadLogs();
}

async function saveEditStudent(){
  const id=parseInt(document.getElementById('edit-student-id').value);
  const name=document.getElementById('edit-student-name').value.trim();
  const parentEmails=Array.from(document.querySelectorAll('#edit-student-parents-list input[type=checkbox]:checked')).map(cb=>cb.value);
  const errEl=document.getElementById('edit-student-error');
  if(!name){errEl.textContent='Please enter a student name.';errEl.style.display='block';return;}
  const{error}=await db.from('students').update({name,parent_emails:parentEmails}).eq('id',id);
  if(error){errEl.textContent=error.message;errEl.style.display='block';return;}
  closeModals();await loadStudents();await loadLogs();
}

async function removeParent(email,name){
  if(!confirm(`Remove ${name}? Their linked students will be unlinked but student records stay.`))return;
  // Remove this email from parent_emails array on all linked students
  const linked=students.filter(s=>(s.parent_emails||[]).includes(email));
  for(const s of linked){
    const updated=(s.parent_emails||[]).filter(e=>e!==email);
    await db.from('students').update({parent_emails:updated}).eq('id',s.id);
  }
  await db.from('users').delete().eq('email',email);
  await loadParents();await loadStudents();
}

async function submitLog(){
  const studentId=parseInt(document.getElementById('log-student-select').value);
  const date=document.getElementById('log-date').value;
  const errEl=document.getElementById('log-error');
  if(!studentId){errEl.textContent='Please select a student.';errEl.style.display='block';return;}
  if(!date){errEl.textContent='Please select a date.';errEl.style.display='block';return;}
  const sabaqFailed=qualityState.sabaq==='Failed';
  const{error}=await db.from('progress_logs').insert({
    student_id:studentId,date,
    sabaq_lines:parseInt(document.getElementById('log-sabaq-lines').value)||null,
    sabaq_quality:sabaqFailed?null:qualityState.sabaq,
    sabaq_failed:sabaqFailed,
    sabqi_juz:document.getElementById('log-sabqi-juz').value.trim()||null,
    sabqi_pages:parseInt(document.getElementById('log-sabqi-pages').value)||null,
    sabqi_quality:qualityState.sabqi==='Failed'?null:qualityState.sabqi,
    sabqi_failed:qualityState.sabqi==='Failed',
    manzil_fraction:manzilFraction,
    manzil_juz:document.getElementById('log-manzil-juz').value.trim()||null,
    manzil_pages:parseInt(document.getElementById('log-manzil-count').value)||null,
    manzil_quality:qualityState.manzil==='Failed'?null:qualityState.manzil,
    manzil_failed:qualityState.manzil==='Failed',
    behavior:qualityState.behavior,
    teacher_notes:document.getElementById('log-notes').value.trim()||null,
  });
  if(error){errEl.textContent=error.message;errEl.style.display='block';return;}

  // Send email notification to linked parents (fire and forget)
  const student=students.find(s=>s.id===studentId);
  if(student?.parent_emails?.length){
    const{data:orgData}=await db.from('organizations').select('name').eq('id',currentUser.org_id).single();
    fetch(`${SUPABASE_URL}/functions/v1/send-notification`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${SUPABASE_KEY}`},
      body:JSON.stringify({
        parent_emails:student.parent_emails,
        student_name:student.name,
        org_name:orgData?.name||'',
        date,
        sabaq_lines:parseInt(document.getElementById('log-sabaq-lines').value)||null,
        sabaq_quality:sabaqFailed?null:qualityState.sabaq,
        sabaq_failed:sabaqFailed,
        sabqi_juz:document.getElementById('log-sabqi-juz').value.trim()||null,
        sabqi_pages:parseInt(document.getElementById('log-sabqi-pages').value)||null,
        sabqi_quality:qualityState.sabqi==='Failed'?null:qualityState.sabqi,
        sabqi_failed:qualityState.sabqi==='Failed',
        manzil_fraction:manzilFraction,
        manzil_juz:document.getElementById('log-manzil-juz').value.trim()||null,
        manzil_pages:parseInt(document.getElementById('log-manzil-count').value)||null,
        manzil_quality:qualityState.manzil==='Failed'?null:qualityState.manzil,
        manzil_failed:qualityState.manzil==='Failed',
        behavior:qualityState.behavior,
        teacher_notes:document.getElementById('log-notes').value.trim()||null,
      }),
    }).catch(()=>{});
  }

  closeModals();await loadStudents();await loadLogs();
}

async function deleteStudent(id,name){
  if(!confirm(`Remove ${name}? This will also delete all their progress logs.`))return;
  await db.from('progress_logs').delete().eq('student_id',id);
  await db.from('students').delete().eq('id',id);
  await loadStudents();await loadLogs();
}

async function changePassword(){
  const pw=document.getElementById('cp-new-password').value,pw2=document.getElementById('cp-new-password2').value;
  const btn=document.getElementById('cp-btn'),errEl=document.getElementById('cp-error'),sucEl=document.getElementById('cp-success');
  if(pw.length<8){errEl.textContent='Password must be at least 8 characters.';errEl.style.display='block';return;}
  if(pw!==pw2){errEl.textContent='Passwords do not match.';errEl.style.display='block';return;}
  btn.disabled=true;btn.textContent='Saving…';errEl.style.display='none';sucEl.style.display='none';
  const{error}=await db.auth.updateUser({password:pw});
  btn.disabled=false;btn.textContent='Update Password';
  if(error){errEl.textContent=error.message;errEl.style.display='block';}
  else{sucEl.textContent='Password updated successfully!';sucEl.style.display='block';document.getElementById('cp-new-password').value='';document.getElementById('cp-new-password2').value='';}
}

async function cancelSubscription(){
  const val=document.getElementById('cancel-confirm').value.trim();
  const errEl=document.getElementById('cancel-error'),sucEl=document.getElementById('cancel-success'),btn=document.getElementById('cancel-btn');
  if(val!=='CANCEL'){errEl.textContent='Please type CANCEL to confirm.';errEl.style.display='block';return;}
  btn.disabled=true;btn.textContent='Processing…';
  if(currentUser.org_id){await db.from('organizations').update({is_active:false,plan:'cancelled'}).eq('id',currentUser.org_id);await db.from('users').update({is_active:false}).eq('org_id',currentUser.org_id);}
  sucEl.textContent='Subscription cancelled. Signing you out…';sucEl.style.display='block';
  setTimeout(async()=>{await db.auth.signOut();window.location.href=BASE+'/index.html';},2500);
}

async function signOut(){await db.auth.signOut();window.location.href=BASE+'/index.html';}

document.querySelectorAll('.modal-overlay').forEach(el=>{el.addEventListener('click',e=>{if(e.target===el)closeModals();});});
init();
