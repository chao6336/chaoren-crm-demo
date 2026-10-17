import { ROLE_LABELS, visibleContact, eventState, campaignEligible, toCsv, dashboardStats } from "./lib.js";

const config = window.CRM_CONFIG || {};
const live = !config.demoMode && config.supabaseUrl && config.supabasePublishableKey;
const supabase = live ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
const liffReady = live && config.liffId ? window.liff.init({ liffId: config.liffId }) : Promise.resolve();
const $ = selector => document.querySelector(selector);

const seed = {
  role: "admin",
  staff: [{id:"s1",display_name:"louis趙",email:"louis@example.com",role:"admin",active:true},{id:"s2",display_name:"活動夥伴",email:"staff@example.com",role:"staff",active:true},{id:"s3",display_name:"觀察員",email:"viewer@example.com",role:"viewer",active:true}],
  events: [
    { id:"evt-1", title:"城市留白｜閱讀與默想", theme:"從忙碌中重新聽見自己", starts_at:"2026-11-15T14:00:00+08:00", registration_deadline:"2026-11-13T23:59:00+08:00", location:"晁人文鼎協會", capacity:24, status:"published", registration_count:3, fee_note:"體驗活動 NT$300" },
    { id:"evt-2", title:"24 節氣冥想體驗", theme:"給第一次接觸冥想的你", starts_at:"2026-12-06T10:00:00+08:00", registration_deadline:"2026-12-03T23:59:00+08:00", location:"線上＋實體", capacity:30, status:"draft", registration_count:1, fee_note:"免費" }
  ],
  contacts: [
    { id:"c1", name:"王小美", display_name:"May", phone:"0912345678", email:"may@example.com", line_user_id:"Udemo01", line_status:"active", marketing_consent:true, tags:["閱讀","睡眠"], last_interaction_at:"2026-10-15", created_at:"2026-10-01" },
    { id:"c2", name:"陳志明", display_name:"Jim", phone:"0987654321", email:"jim@example.com", line_user_id:"Udemo02", line_status:"active", marketing_consent:true, tags:["冥想"], last_interaction_at:"2026-10-12", created_at:"2026-10-05" },
    { id:"c3", name:"林雅婷", display_name:"Ting", phone:"0922111222", email:"ting@example.com", line_user_id:"Udemo03", line_status:"blocked", marketing_consent:true, tags:["閱讀"], last_interaction_at:"2026-10-08", created_at:"2026-10-08" },
    { id:"c4", name:"周文豪", display_name:"Howard", phone:"0933000111", email:"howard@example.com", line_user_id:"Udemo04", line_status:"active", marketing_consent:false, tags:["冥想"], last_interaction_at:"2026-10-10", created_at:"2026-10-10" }
  ],
  registrations: [
    { id:"r1", event_id:"evt-1", contact_id:"c1", attendance_status:"attended", payment_status:"paid", registered_at:"2026-10-10", cancelled_at:null },
    { id:"r2", event_id:"evt-1", contact_id:"c2", attendance_status:"registered", payment_status:"pending", registered_at:"2026-10-11", cancelled_at:null },
    { id:"r3", event_id:"evt-1", contact_id:"c3", attendance_status:"registered", payment_status:"paid", registered_at:"2026-10-12", cancelled_at:null },
    { id:"r4", event_id:"evt-2", contact_id:"c4", attendance_status:"registered", payment_status:"free", registered_at:"2026-10-13", cancelled_at:null }
  ],
  campaigns: [{ id:"m1", name:"城市留白行前提醒", event_id:"evt-1", body:"提醒您：城市留白活動將於 11/15 下午 2 點開始，期待與您相見。", status:"draft", eligible_count:2, success_count:0, failed_count:0 }],
  audit: [{ at:"2026-10-17 09:20", actor:"louis趙", action:"登入展示系統", target:"CRM" }]
};

let state = loadDemo();

function loadDemo(){
  try { return JSON.parse(localStorage.getItem("chaoren-crm-demo")) || structuredClone(seed); }
  catch { return structuredClone(seed); }
}
function persist(){ if(!live) localStorage.setItem("chaoren-crm-demo", JSON.stringify(state)); }
function toast(message){ const el=$("#toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2200); }
function escapeHtml(value=""){ return String(value).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function fmtDate(value){ return new Intl.DateTimeFormat("zh-TW",{dateStyle:"medium",timeStyle:value?.includes("T")?"short":undefined}).format(new Date(value)); }
function modal(html){ $("#modalBody").innerHTML=html; $("#modal").showModal(); }
function closeModal(){ $("#modal").close(); }
function route(){ return (location.hash.slice(1).split("?")[0] || "dashboard"); }
function query(){ return new URLSearchParams(location.hash.split("?")[1] || ""); }
function pageHead(title,subtitle,actions=""){ return `<section class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></section>`; }

async function boot(){
  $("#modeBadge").textContent=live?"已連雲端":"展示模式";
  if(live && route()==="register") await loadPublicEvent();
  else if(live) await loadLiveData();
  addEventListener("hashchange",render);
  document.addEventListener("click",onClick);
  document.addEventListener("submit",onSubmit);
  render();
}

async function loadPublicEvent(){
  const eventId=query().get("event");
  const {data,error}=await supabase.from("public_events").select("*").eq("id",eventId).single();
  state={role:"public",staff:[],events:error?[]:[data],contacts:[],registrations:[],campaigns:[],audit:[]};
}

async function loadLiveData(){
  const { data:{ session } } = await supabase.auth.getSession();
  if(!session){ location.hash="login"; return; }
  const [profile,events,contacts,registrations,campaigns,audit] = await Promise.all([
    supabase.from("staff_profiles").select("role,display_name").eq("user_id",session.user.id).single(),
    supabase.from("events_with_counts").select("*").order("starts_at"),
    supabase.from("contacts_safe").select("*").order("last_interaction_at",{ascending:false}),
    supabase.from("registrations").select("*").order("registered_at",{ascending:false}),
    supabase.from("message_campaigns").select("*").order("created_at",{ascending:false}),
    supabase.from("audit_log").select("created_at,action,target_type,target_id").order("created_at",{ascending:false}).limit(50)
  ]);
  const staff = profile.data?.role === "admin" ? await supabase.from("staff_profiles").select("user_id,display_name,role,active") : {data:[]};
  state={role:profile.data?.role||"viewer",staff:staff.data||[],events:events.data||[],contacts:contacts.data||[],registrations:registrations.data||[],campaigns:campaigns.data||[],audit:(audit.data||[]).map(x=>({at:x.created_at,actor:"工作人員",action:x.action,target:`${x.target_type}:${x.target_id||""}`}))};
  $("#userLabel").textContent=`${profile.data?.display_name||session.user.email}・${ROLE_LABELS[state.role]}`;
}

function render(){
  const name=route();
  document.querySelectorAll(".sidebar a").forEach(a=>a.classList.toggle("active",a.dataset.route===name));
  const views={dashboard,events,contacts,checkin,messages,governance,users,register,login};
  $("#app").innerHTML=(views[name]||dashboard)();
  if(name==="register"&&window.qrcode&&$("#qr")){ const code=window.qrcode(0,"M");code.addData(location.href);code.make();$("#qr").innerHTML=code.createSvgTag(4,0); }
  $("#app").focus();
}

function dashboard(){
  const s=dashboardStats(state.events,state.registrations,state.contacts);
  const next=state.events.filter(e=>new Date(e.starts_at)>new Date()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0];
  return `${pageHead("營運總覽","把活動、參加者與後續關懷放在同一個地方。")}
  <section class="stats">
    <div class="stat"><span>活動數</span><strong>${s.events}</strong></div><div class="stat"><span>有效報名</span><strong>${s.registrations}</strong></div>
    <div class="stat"><span>出席率</span><strong>${s.attendanceRate}%</strong></div><div class="stat"><span>取消率</span><strong>${s.cancellationRate}%</strong></div><div class="stat"><span>聯絡人</span><strong>${s.contacts}</strong></div>
  </section>
  <section class="grid"><article class="card"><h2>下一場活動</h2>${next?`<h3>${escapeHtml(next.title)}</h3><p>${fmtDate(next.starts_at)}・${escapeHtml(next.location)}</p><div class="kpi-line"><span>報名</span><strong>${next.registration_count}/${next.capacity}</strong></div><div class="actions"><a class="button" href="#checkin?event=${next.id}">開啟報到</a><a class="button secondary" href="#register?event=${next.id}">查看報名頁</a></div>`:"<p class='muted'>目前沒有未來活動。</p>"}</article>
  <article class="card"><h2>需要注意</h2><div class="kpi-line"><span>待繳費</span><strong>${state.registrations.filter(r=>r.payment_status==="pending").length}</strong></div><div class="kpi-line"><span>待確認訊息</span><strong>${state.campaigns.filter(c=>c.status==="draft").length}</strong></div><div class="kpi-line"><span>無法 LINE 聯絡</span><strong>${state.contacts.filter(c=>!campaignEligible(c)).length}</strong></div></article></section>`;
}

function events(){
  const create=state.role==="viewer"?"":`<button data-action="new-event">＋ 建立活動</button>`;
  return `${pageHead("活動管理","建立活動、查看報名進度並取得公開連結。",create)}<div class="table-wrap"><table><thead><tr><th>活動</th><th>日期</th><th>地點</th><th>報名</th><th>狀態</th><th>操作</th></tr></thead><tbody>${state.events.map(e=>`<tr><td><strong>${escapeHtml(e.title)}</strong><br><small>${escapeHtml(e.theme)}</small></td><td>${fmtDate(e.starts_at)}</td><td>${escapeHtml(e.location)}</td><td>${e.registration_count}/${e.capacity}</td><td><span class="pill">${eventState(e)}</span></td><td><a href="#register?event=${e.id}">報名頁</a>　<a href="#checkin?event=${e.id}">報到</a></td></tr>`).join("")}</tbody></table></div>`;
}

function contacts(){
  const rows=state.contacts.map(c=>visibleContact(c,state.role));
  return `${pageHead("聯絡人","會員資料、興趣與活動歷程；一般幹部看到遮罩後的個資。",state.role==="admin"?`<button class="secondary" data-action="export-contacts">匯出 CSV</button>`:"")}<input class="search" id="contactSearch" placeholder="搜尋姓名、LINE 名稱或標籤" aria-label="搜尋聯絡人"><div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>聯絡人</th><th>手機／Email</th><th>標籤</th><th>LINE</th><th>最後互動</th></tr></thead><tbody id="contactRows">${contactRows(rows)}</tbody></table></div>`;
}
function contactRows(rows){ return rows.map(c=>`<tr data-search="${escapeHtml([c.name,c.display_name,...(c.tags||[])].join(" ").toLowerCase())}"><td><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.display_name)}</small></td><td>${escapeHtml(c.phone)}<br><small>${escapeHtml(c.email)}</small></td><td>${(c.tags||[]).map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(" ")}</td><td><span class="pill ${c.line_status!=="active"?"off":""}">${c.line_status==="active"?"可聯絡":"已封鎖"}</span></td><td>${fmtDate(c.last_interaction_at)}</td></tr>`).join(""); }

function checkin(){
  const eventId=query().get("event")||state.events[0]?.id; const event=state.events.find(e=>e.id===eventId);
  const regs=state.registrations.filter(r=>r.event_id===eventId&&!r.cancelled_at).map(r=>({...r,contact:state.contacts.find(c=>c.id===r.contact_id)}));
  return `${pageHead("現場報到",event?`${event.title}・${fmtDate(event.starts_at)}`:"請先建立活動",`<select id="eventSwitch">${state.events.map(e=>`<option value="${e.id}" ${e.id===eventId?"selected":""}>${escapeHtml(e.title)}</option>`).join("")}</select>`)}<input class="search" id="checkinSearch" placeholder="搜尋姓名或手機末三碼"><div class="checkin-list" style="margin-top:15px">${regs.map(r=>`<div class="checkin-item" data-search="${escapeHtml(`${r.contact?.name} ${r.contact?.phone?.slice(-3)}`.toLowerCase())}"><div><strong>${escapeHtml(r.contact?.name||"未知")}</strong><small>手機末三碼 ${escapeHtml(r.contact?.phone?.slice(-3)||"---")}・${r.payment_status==="paid"?"已繳":"待確認款項"}</small></div><button data-action="toggle-checkin" data-id="${r.id}" class="${r.attendance_status==="attended"?"secondary":""}">${r.attendance_status==="attended"?"已報到 ✓":"確認報到"}</button></div>`).join("")||"<div class='empty'>目前沒有報名者</div>"}</div>`;
}

function messages(){
  return `${pageHead("LINE 訊息","訊息必須由幹部檢查對象與內容後，才能送出。",state.role==="viewer"?"":`<button data-action="new-campaign">＋ 新增草稿</button>`)}<div class="notice">系統不會自動發送。按下「檢查並送出」後，還會再次顯示實際對象與訊息全文。</div><div class="grid">${state.campaigns.map(c=>`<article class="card"><span class="pill ${c.status!=="draft"?"off":""}">${({draft:"草稿",partial:"部分失敗",failed:"失敗",sent:"已送出",sending:"發送中"})[c.status]||c.status}</span><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.body)}</p><div class="kpi-line"><span>符合條件</span><strong>${c.eligible_count}</strong></div><div class="kpi-line"><span>成功／失敗</span><strong>${c.success_count}/${c.failed_count}</strong></div>${["draft","partial","failed"].includes(c.status)&&state.role!=="viewer"?`<button data-action="review-campaign" data-id="${c.id}">${c.status==="draft"?"檢查並送出":"重送失敗對象"}</button>`:""}</article>`).join("")}</div>`;
}

function governance(){
  const old=state.contacts.filter(c=>!c.anonymized_at&&new Date(c.last_interaction_at)<new Date(Date.now()-730*864e5));
  return `${pageHead("資料治理","備份、操作紀錄與兩年閒置資料匿名化。")}<section class="two-col"><article class="card"><h2>資料保存</h2><p>目前符合「閒置滿兩年」的聯絡人：<strong>${old.length}</strong> 位。</p><button data-action="preview-anonymize" ${state.role!=="admin"?"disabled":""}>預覽匿名化名單</button><p class="muted">匿名化只保留活動統計，姓名、手機、Email 與 LINE 識別碼將不可還原。</p></article><article class="card"><h2>備份</h2><p>管理者可匯出不含系統秘密的 JSON 備份。</p><button class="secondary" data-action="backup" ${state.role!=="admin"?"disabled":""}>匯出資料備份</button></article></section><h2>最近操作</h2><div class="table-wrap"><table><thead><tr><th>時間</th><th>人員</th><th>動作</th><th>對象</th></tr></thead><tbody>${state.audit.map(a=>`<tr><td>${escapeHtml(a.at)}</td><td>${escapeHtml(a.actor)}</td><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.target)}</td></tr>`).join("")}</tbody></table></div>`;
}

function users(){
  if(state.role!=="admin")return `${pageHead("使用者","只有管理者可以管理帳號。")}<div class="notice">你沒有使用者管理權限。</div>`;
  return `${pageHead("使用者管理","邀請幹部後，再指定管理者、活動幹部或唯讀權限。",`<button data-action="invite-user">＋ 邀請使用者</button>`)}<div class="table-wrap"><table><thead><tr><th>姓名</th><th>帳號</th><th>權限</th><th>狀態</th></tr></thead><tbody>${(state.staff||[]).map(s=>`<tr><td>${escapeHtml(s.display_name)}</td><td>${escapeHtml(s.email||s.user_id||"")}</td><td>${ROLE_LABELS[s.role]}</td><td>${s.active?"已開通":"待開通"}</td></tr>`).join("")}</tbody></table></div>`;
}

function register(){
  const event=state.events.find(e=>e.id===(query().get("event")||state.events[0]?.id));
  if(!event)return `<div class="empty">找不到這場活動。</div>`;
  return `${pageHead(event.title,event.theme)}<section class="two-col"><article class="card"><h2>活動資訊</h2><div class="kpi-line"><span>時間</span><strong>${fmtDate(event.starts_at)}</strong></div><div class="kpi-line"><span>地點</span><strong>${escapeHtml(event.location)}</strong></div><div class="kpi-line"><span>費用</span><strong>${escapeHtml(event.fee_note)}</strong></div><div class="kpi-line"><span>名額</span><strong>${event.registration_count}/${event.capacity}</strong></div><p class="muted">分享報名 QR Code</p><div id="qr" aria-label="活動報名 QR Code"></div></article><article class="card"><h2>LINE 登入＋簡短報名</h2>${eventState(event)!=="報名中"?`<div class="notice">目前${eventState(event)}，暫停接受報名。</div>`:`<form id="registrationForm"><input type="hidden" name="event_id" value="${event.id}"><div class="form-grid"><div class="field"><label>姓名 *</label><input name="name" required maxlength="40"></div><div class="field"><label>手機 *</label><input name="phone" required inputmode="tel" pattern="09[0-9]{8}" placeholder="0912345678"></div><div class="field full"><label>Email</label><input name="email" type="email"></div><div class="field full"><label>有興趣的主題</label><select name="interest"><option>閱讀</option><option>冥想</option><option>身心放鬆</option><option>節氣生活</option></select></div><label class="field full"><span><input type="checkbox" name="privacy" required> 我已閱讀並同意<a href="privacy.html" target="_blank">個資告知</a>，資料僅用於活動與會員服務。</span></label><label class="field full"><span><input type="checkbox" name="marketing"> 我同意接收後續活動與課程訊息，可隨時撤回。</span></label><button class="field full" type="submit">使用 LINE 身分送出報名</button><button class="field full secondary" type="button" data-action="cancel-registration" data-event="${event.id}">取消我的報名</button></div></form>`}</article></section>`;
}

function login(){ return `${pageHead("工作人員登入","只有經管理者開通的帳號能查看 CRM。")}
  <article class="card" style="max-width:460px;margin:auto"><form id="loginForm"><div class="field"><label>Email</label><input type="email" name="email" required></div><div class="field" style="margin-top:12px"><label>密碼</label><input type="password" name="password" required></div><button style="margin-top:16px;width:100%">登入</button></form></article>`; }

async function onClick(event){
  const btn=event.target.closest("[data-action]");
  if(!btn){ if(event.target.id==="contactSearch"||event.target.id==="checkinSearch")return; return; }
  const action=btn.dataset.action;
  if(action==="close-modal") return closeModal();
  if(action==="new-event") return modal(`<h2>建立活動</h2><form id="eventForm"><div class="form-grid"><div class="field full"><label>活動名稱</label><input name="title" required></div><div class="field full"><label>主題</label><input name="theme" required></div><div class="field"><label>開始時間</label><input name="starts_at" type="datetime-local" required></div><div class="field"><label>報名截止</label><input name="registration_deadline" type="datetime-local" required></div><div class="field"><label>地點</label><input name="location" required></div><div class="field"><label>名額</label><input name="capacity" type="number" min="1" max="500" value="24" required></div><div class="field full"><label>費用說明</label><input name="fee_note" value="免費"></div><button>儲存活動</button></div></form>`);
  if(action==="invite-user") return modal(`<h2>邀請使用者</h2><form id="inviteForm"><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>顯示名稱</label><input name="display_name" required></div><div class="field"><label>權限</label><select name="role"><option value="staff">活動幹部</option><option value="viewer">唯讀</option><option value="admin">管理者</option></select></div><button>寄出邀請</button></form>`);
  if(action==="toggle-checkin") return toggleCheckin(btn.dataset.id);
  if(action==="export-contacts") return download("聯絡人.csv",toCsv(state.contacts,[["姓名","name"],["LINE 名稱","display_name"],["手機","phone"],["Email","email"],["最後互動","last_interaction_at"]]),"text/csv;charset=utf-8");
  if(action==="backup"){
    if(live){const {data,error}=await supabase.functions.invoke("export-backup",{body:{}});if(error)return toast(error.message);return download(`crm-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),"application/json");}
    return download(`crm-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(state,null,2),"application/json");
  }
  if(action==="preview-anonymize") return previewAnonymize();
  if(action==="new-campaign") return modal(`<h2>新增 LINE 訊息草稿</h2><form id="campaignForm"><div class="field"><label>草稿名稱</label><input name="name" required></div><div class="field"><label>關聯活動</label><select name="event_id">${state.events.map(e=>`<option value="${e.id}">${escapeHtml(e.title)}</option>`).join("")}</select></div><div class="field"><label>訊息內容</label><textarea name="body" required maxlength="500"></textarea></div><button>儲存草稿</button></form>`);
  if(action==="review-campaign") return reviewCampaign(btn.dataset.id);
  if(action==="cancel-registration") return cancelRegistration(btn.dataset.event);
}

document.addEventListener("input",event=>{
  if(event.target.id==="contactSearch"||event.target.id==="checkinSearch"){
    const value=event.target.value.toLowerCase().trim();
    document.querySelectorAll("[data-search]").forEach(row=>row.hidden=!row.dataset.search.includes(value));
  }
});
document.addEventListener("change",event=>{ if(event.target.id==="eventSwitch")location.hash=`checkin?event=${event.target.value}`; });

async function onSubmit(event){
  if(!["eventForm","campaignForm","registrationForm","loginForm","anonymizeForm","inviteForm"].includes(event.target.id))return;
  event.preventDefault(); const data=Object.fromEntries(new FormData(event.target));
  if(event.target.id==="eventForm"){
    if(live){ const {error}=await supabase.from("events").insert({...data,capacity:Number(data.capacity),status:"published"}); if(error)return toast(error.message); await loadLiveData(); }
    else state.events.push({id:crypto.randomUUID(),...data,capacity:Number(data.capacity),status:"published",registration_count:0});
    audit("建立活動",data.title); persist(); closeModal(); render(); toast("活動已建立");
  }
  if(event.target.id==="campaignForm"){
    const count=eligibleForEvent(data.event_id).length;
    if(live){ const {error}=await supabase.from("message_campaigns").insert({...data,status:"draft",eligible_count:count}); if(error)return toast(error.message); await loadLiveData(); }
    else state.campaigns.push({id:crypto.randomUUID(),...data,status:"draft",eligible_count:count,success_count:0,failed_count:0});
    audit("建立訊息草稿",data.name);persist();closeModal();render();toast("草稿已儲存，尚未發送");
  }
  if(event.target.id==="registrationForm") return submitRegistration(data);
  if(event.target.id==="loginForm"){
    const {error}=await supabase.auth.signInWithPassword(data); if(error)return toast("登入失敗，請確認帳號與密碼"); await loadLiveData();location.hash="dashboard";
  }
  if(event.target.id==="anonymizeForm") return executeAnonymize(data.confirmText);
  if(event.target.id==="inviteForm"){
    if(live){const {error}=await supabase.functions.invoke("manage-staff",{body:data});if(error)return toast(error.message);await loadLiveData();}
    else state.staff.push({id:crypto.randomUUID(),...data,active:true});
    persist();closeModal();render();toast("邀請已建立");
  }
}

async function submitRegistration(data){
  if(live){
    try{ await liffReady; if(!window.liff.isLoggedIn())return window.liff.login(); const idToken=window.liff.getIDToken(); const res=await fetch(`${config.supabaseUrl}/functions/v1/line-auth`,{method:"POST",headers:{"Content-Type":"application/json","apikey":config.supabasePublishableKey},body:JSON.stringify({...data,idToken,marketing:data.marketing==="on"})}); const body=await res.json(); if(!res.ok)throw new Error(body.error||"報名失敗"); }
    catch(error){return toast(error.message);}
  } else {
    const id=crypto.randomUUID(); state.contacts.push({id,name:data.name,display_name:"LINE 展示會員",phone:data.phone,email:data.email,line_user_id:`Udemo${Date.now()}`,line_status:"active",marketing_consent:data.marketing==="on",tags:[data.interest],last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()}); state.registrations.push({id:crypto.randomUUID(),event_id:data.event_id,contact_id:id,attendance_status:"registered",payment_status:"pending",registered_at:new Date().toISOString(),cancelled_at:null}); const e=state.events.find(x=>x.id===data.event_id);e.registration_count++;
  }
  persist(); $("#app").innerHTML=`<article class="card" style="max-width:560px;margin:40px auto;text-align:center"><h1>報名完成</h1><p>我們已收到你的資料，活動前會透過 LINE 提醒你。</p><a class="button" href="#register?event=${data.event_id}">回到活動頁</a></article>`;
}

async function cancelRegistration(eventId){
  if(!live){
    const reg=state.registrations.find(r=>r.event_id===eventId&&!r.cancelled_at);
    if(!reg)return toast("找不到可取消的報名");
    reg.cancelled_at=new Date().toISOString();reg.attendance_status="cancelled";persist();toast("已取消報名");render();return;
  }
  try{
    await liffReady;if(!window.liff.isLoggedIn())return window.liff.login();
    const res=await fetch(`${config.supabaseUrl}/functions/v1/line-auth`,{method:"POST",headers:{"Content-Type":"application/json",apikey:config.supabasePublishableKey},body:JSON.stringify({action:"cancel",event_id:eventId,idToken:window.liff.getIDToken()})});
    const body=await res.json();if(!res.ok)throw new Error(body.error||"取消失敗");toast("已取消報名");
  }catch(error){toast(error.message);}
}

async function previewAnonymize(){
  let count=0;
  if(live){const {data,error}=await supabase.functions.invoke("anonymize-contacts",{body:{mode:"preview"}});if(error)return toast(error.message);count=data.count;}
  else count=state.contacts.filter(c=>!c.anonymized_at&&new Date(c.last_interaction_at)<new Date(Date.now()-730*864e5)).length;
  modal(`<h2>匿名化預覽</h2><p>符合條件：${count} 位。</p>${count?`<form id="anonymizeForm"><div class="field"><label>輸入「匿名化且無法還原」</label><input name="confirmText" required></div><button class="danger">執行匿名化</button></form>`:`<button value="cancel">關閉</button>`}`);
}

async function executeAnonymize(confirmText){
  if(confirmText!=="匿名化且無法還原")return toast("確認文字不符");
  if(live){const {data,error}=await supabase.functions.invoke("anonymize-contacts",{body:{mode:"execute",confirmText}});if(error)return toast(error.message);closeModal();await loadLiveData();render();return toast(`已匿名化 ${data.count} 位`);}
  const old=state.contacts.filter(c=>!c.anonymized_at&&new Date(c.last_interaction_at)<new Date(Date.now()-730*864e5));
  old.forEach(c=>Object.assign(c,{line_user_id:null,display_name:"",name:"匿名會員",phone:null,email:null,marketing_consent:false,line_status:"unknown",anonymized_at:new Date().toISOString()}));
  persist();closeModal();render();toast(`已匿名化 ${old.length} 位`);
}

async function toggleCheckin(id){
  const reg=state.registrations.find(r=>r.id===id); const next=reg.attendance_status==="attended"?"registered":"attended";
  if(live){ const {error}=await supabase.from("registrations").update({attendance_status:next,checked_in_at:next==="attended"?new Date().toISOString():null}).eq("id",id); if(error)return toast(error.message); await loadLiveData(); }
  else reg.attendance_status=next;
  audit(next==="attended"?"完成報到":"取消報到",id);persist();render();toast(next==="attended"?"已完成報到":"已取消報到");
}
function eligibleForEvent(eventId){ const ids=new Set(state.registrations.filter(r=>r.event_id===eventId&&!r.cancelled_at).map(r=>r.contact_id)); return state.contacts.filter(c=>ids.has(c.id)&&campaignEligible(c)); }
function reviewCampaign(id){ const c=state.campaigns.find(x=>x.id===id); const people=eligibleForEvent(c.event_id); modal(`<h2>最後確認</h2><div class="notice">即將發送給 <strong>${people.length}</strong> 位已同意且可聯絡的 LINE 好友。</div><p><strong>${escapeHtml(c.name)}</strong></p><p>${escapeHtml(c.body)}</p><form id="sendCampaignForm"><button type="button" data-send-id="${c.id}" id="confirmSend">確認送出</button> <button class="secondary" value="cancel">返回修改</button></form>`); $("#confirmSend").onclick=()=>sendCampaign(c,people); }
async function sendCampaign(c,people){
  $("#confirmSend").disabled=true;
  if(live){ const {data,error}=await supabase.functions.invoke("send-campaign",{body:{campaignId:c.id}}); if(error){$("#confirmSend").disabled=false;return toast(error.message);} c.success_count=data.success;c.failed_count=data.failed; }
  else { c.success_count=people.length;c.failed_count=0;c.status="sent"; }
  audit("確認並發送 LINE 訊息",c.name);persist();closeModal();render();toast(`已完成：成功 ${c.success_count}、失敗 ${c.failed_count}`);
}
function audit(action,target){ state.audit.unshift({at:new Date().toLocaleString("zh-TW"),actor:"louis趙",action,target}); }
function download(name,content,type){ const blob=new Blob([type.startsWith("text/csv")?"\ufeff"+content:content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);audit("匯出資料",name);persist();toast(`已下載 ${name}`); }

boot();
