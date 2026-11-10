const sb=window.supabase.createClient("https://zyxpfnxkpakrtcddnwph.supabase.co","sb_publishable_va01K3WDNzrBgtt3c-LyCA_aoIZc3o-");
const $=s=>document.querySelector(s);
const savedLeadDays=localStorage.getItem("hexhamSantaEmailLeadDays");
if(["3","5","7","10"].includes(savedLeadDays)&&$("#lead-days"))$("#lead-days").value=savedLeadDays;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
let bookings=[],selectedId=null,visible=[];const approvedIds=new Set();const testStatusById=new Map();let approvalBusy=false;
async function approvalRequest(method="POST",body=null){
 const options={method,headers:{}};
 if(body){options.body=body;}
 const {data,error}=await sb.functions.invoke("email-approvals",options);
 if(error)throw error;
 if(data?.error)throw new Error(data.error);
 return data;
}
async function loadSavedApprovals(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw new Error("Please sign in again.");
 const response=await fetch("https://zyxpfnxkpakrtcddnwph.supabase.co/functions/v1/email-approvals?lead_days="+encodeURIComponent($("#lead-days").value),{
  method:"GET",headers:{Authorization:"Bearer "+session.access_token,apikey:"sb_publishable_va01K3WDNzrBgtt3c-LyCA_aoIZc3o-"}
 });
 const data=await response.json();
 if(!response.ok)throw new Error(data?.error||"Could not load saved approvals.");
 approvedIds.clear();
 Object.entries(data?.approvals||{}).forEach(([id,row])=>{if(row.approved)approvedIds.add(id)});
}
async function saveApproval(b,approved){
 if(approvalBusy)return false;
 approvalBusy=true;
 try{
  await approvalRequest("POST",{
   action:"set",bookingId:b.id,approved,
   leadDays:Number($("#lead-days").value),visitDate:dayKey(b.visit_starts_at)
  });
  if(approved)approvedIds.add(b.id);else approvedIds.delete(b.id);
  return true;
 }catch(e){alert(e.message||"Could not save this approval. Please try again.");return false}
 finally{approvalBusy=false;renderApproval();if(selectedId)selectBooking(selectedId)}
}
function dateTime(v){if(!v)return "Time to be confirmed";return new Date(v).toLocaleString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})}
function family(b){return ((b.parent_first_name||"")+" "+(b.parent_last_name||"")).trim()||"Name not provided"}
function emailState(b){const s=String(b.status||"confirmed").toLowerCase();if(s!=="confirmed")return {ready:false,label:s==="cancelled"?"Cancelled":s==="completed"?"Completed":s==="no_show"?"No-show":"Not confirmed",kind:"off"};const e=String(b.parent_email||"").trim();if(!e)return {ready:false,label:"Missing email",kind:"warn"};if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))return {ready:false,label:"Check email",kind:"warn"};return {ready:true,label:"Ready",kind:""}}
function counts(){const ready=bookings.filter(b=>emailState(b).ready);const byEmail=new Map();ready.forEach(b=>{const k=b.parent_email.trim().toLowerCase();byEmail.set(k,(byEmail.get(k)||0)+1)});const dup=[...byEmail.values()].filter(n=>n>1).reduce((a,n)=>a+n,0);$("#stat-total").textContent=bookings.length;$("#stat-ready").textContent=ready.length;$("#stat-excluded").textContent=bookings.length-ready.length;$("#stat-duplicates").textContent=dup}
function emailHtml(b){const kids=b?.santa_children||[];const first=(b?.parent_first_name||"there").trim()||"there";const subject="Your upcoming visit to Santa in Hexham";return '<div class="email-frame"><div class="email-head"><div><b>To</b> '+esc(b?.parent_email||"family@example.com")+'</div><div><b>Subject</b> '+esc(subject)+'</div></div><div class="email-body"><div class="email-brand">HEXHAM CHRISTMAS</div><h2>Your visit to Santa is getting closer!</h2><p>Hello '+esc(first)+',</p><p>We’re looking forward to welcoming you and your family to see Santa at Hexham Old Gaol.</p><div class="visit-card"><strong>Your visit details</strong>'+esc(dateTime(b?.visit_starts_at))+'<br>Hexham Old Gaol, Hexham<br>'+kids.length+' '+(kids.length===1?"child":"children")+" included in this booking"+'</div><p>If anything has changed since you booked, please get in touch with the Hexham Christmas team before your visit.</p><p>There is still time to make sure Santa has the latest little details about your child. Please review your family information and add or update anything you would like Santa to know at least 48 hours before your visit.</p><p>We can’t wait to see you.</p><p>Warm wishes,<br><strong>The Hexham Christmas team</strong></p></div><div class="email-foot">This message relates to your Hexham Santa booking. If you believe you have received it in error, please contact the Hexham Christmas team.</div></div>'}
async function refreshTestStatus(b){
 const button=$("#send-test-email"),result=$("#test-send-result");
 if(!button||selectedId!==b.id)return;
 button.disabled=true;button.textContent="Checking previous attempt…";
 try{
  const {data,error}=await sb.functions.invoke("email-send-test",{body:{action:"status",bookingId:b.id,leadDays:Number($("#lead-days").value),visitDate:dayKey(b.visit_starts_at)}});
  if(error)throw error;
  if(!data||data.ok!==true)throw new Error(data?.error||"Could not verify the send history.");
  testStatusById.set(b.id,data.attempted?{status:data.status,sent_at:data.sent_at||null,attempted:true}:{status:"not_sent",attempted:false});renderList();
  if(selectedId!==b.id)return;
  if(data.attempted){
   button.remove();result.style.display="block";
   const when=data.sent_at?" on "+dateTime(data.sent_at):"";
   result.textContent=data.status==="sent"?"Test email already sent"+when+". Sending again is blocked.":data.status==="failed"?"A previous test attempt failed. It is locked to prevent accidental duplicates. Check the send log before taking any further action.":"A test send attempt is already recorded ("+data.status+"). Sending again is blocked.";
  }else{button.disabled=false;button.textContent="Send test email to my inbox";result.style.display="none";}
 }catch(e){
  if(selectedId!==b.id)return;
  button.remove();result.style.display="block";
  result.textContent="Could not verify the previous send history, so test sending is disabled for safety. Refresh the page or try again later.";
  testStatusById.set(b.id,{status:"unavailable",attempted:false});renderList();console.error("Test send history unavailable",e);
 }
}
function selectBooking(id){selectedId=id;const b=bookings.find(x=>x.id===id);if(!b)return;const state=emailState(b);const kids=b.santa_children||[];$("#review-index").textContent="Booking "+(bookings.findIndex(x=>x.id===id)+1)+" of "+bookings.length;$("#recipient-detail").innerHTML='<div class="review-heading"><h2>'+esc(family(b))+'</h2><span class="pill '+state.kind+'">'+esc(state.label)+'</span></div><p class="muted">'+esc(b.parent_email||"No email address")+'</p><p><strong>Visit:</strong><br>'+esc(dateTime(b.visit_starts_at))+'</p><p><strong>Booking status:</strong> '+esc(b.status||"confirmed")+'</p><p><strong>Children:</strong> '+kids.length+'</p>'+(kids.length?'<ul>'+kids.map(c=>'<li>'+esc(c.preferred_name||"Unnamed child")+(c.age!=null?" · Age "+esc(c.age):"")+'</li>').join("")+'</ul>':'<p class="muted">No child records attached.</p>')+'<div class="notice">Review the personalised email before approving this booking. Approval does not send anything.</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px"><button id="show-email-preview" '+(!state.ready?"disabled":"")+'>Preview personalised email</button><button id="toggle-approval" class="secondary" '+(!state.ready?"disabled":"")+'>'+(approvedIds.has(b.id)?"Remove approval":"Approve email")+'</button>'+(approvedIds.has(b.id)?'<button id="send-test-email" class="secondary" disabled>Checking previous attempt…</button>':'')+'</div><p class="muted" style="font:12px Arial,sans-serif;margin-top:8px">'+(approvedIds.has(b.id)?"Approved and saved. Test sending is restricted to your configured internal inbox.":"Not yet approved.")+'</p><div id="test-send-result" class="notice" style="display:none;margin-top:12px"></div><div id="inline-email" style="margin-top:16px"></div>';$("#show-email-preview")?.addEventListener("click",()=>{$("#inline-email").innerHTML=emailHtml(b)});$("#toggle-approval")?.addEventListener("click",async()=>{await saveApproval(b,!approvedIds.has(b.id))});$("#send-test-email")?.addEventListener("click",async()=>{if(!confirm("Send this approved fictional booking email to your configured internal test inbox? The booking email address will not receive it."))return;const button=$("#send-test-email"),result=$("#test-send-result");button.disabled=true;button.textContent="Sending test…";result.style.display="block";result.textContent="Sending to the internal test inbox only…";try{const {data,error}=await sb.functions.invoke("email-send-test",{body:{bookingId:b.id,leadDays:Number($("#lead-days").value),visitDate:dayKey(b.visit_starts_at)}});if(error)throw error;if(data?.error)throw new Error(data.error);result.textContent="Test email accepted by Resend and sent to the configured internal inbox. Message ID: "+data.provider_message_id;button.remove();result.textContent="Test email sent to your internal test inbox. This attempt is now recorded and cannot be sent again."}catch(e){result.textContent=e.message||"Test email could not be sent. Check the send log before trying again.";button.remove();result.textContent="The attempt was not confirmed. Sending is locked until the send history has been checked.";refreshTestStatus(b)}});$("#template-preview").innerHTML=emailHtml(b);renderList();renderApproval();if(approvedIds.has(b.id)&&state.ready)refreshTestStatus(b)}
function dayKey(v){if(!v)return "date-tbc";const d=new Date(v);if(Number.isNaN(d.getTime()))return "date-tbc";return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function localDateLabel(d){return d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
function batchInfo(key){if(key==="date-tbc")return {label:"Visit date to be confirmed",due:"Cannot calculate review date",tone:"off"};const [y,m,d]=key.split("-").map(Number);const visit=new Date(y,m-1,d);const lead=Number($("#lead-days")?.value||5);const due=new Date(y,m-1,d-lead);const today=new Date();today.setHours(0,0,0,0);const delta=Math.round((due-today)/86400000);let dueText;if(delta<0)dueText="Review date passed";else if(delta===0)dueText="Review due today";else if(delta===1)dueText="Review due tomorrow";else dueText="Review due "+localDateLabel(due);return {label:localDateLabel(visit),due:dueText,tone:delta<=0?"warn":""}}
async function loadTestStatuses(){
 const targets=bookings.filter(b=>emailState(b).ready&&!testStatusById.has(b.id));
 await Promise.all(targets.map(async b=>{
  try{
   const {data,error}=await sb.functions.invoke("email-send-test",{body:{action:"status",bookingId:b.id,leadDays:Number($("#lead-days").value),visitDate:dayKey(b.visit_starts_at)}});
   if(error||!data||data.ok!==true)throw error||new Error(data?.error||"Status unavailable");
   testStatusById.set(b.id,data.attempted?{status:data.status,sent_at:data.sent_at||null,attempted:true}:{status:"not_sent",attempted:false});
  }catch(e){testStatusById.set(b.id,{status:"unavailable",attempted:false});}
 }));
 renderList();
}
function visibleEmailStatus(b){
 const saved=testStatusById.get(b.id);
 if(saved?.attempted){if(saved.status==="sent")return {label:"Test email sent",kind:"sent"};if(saved.status==="failed")return {label:"Test send failed",kind:"warn"};return {label:"Test attempt recorded",kind:"warn"}}
 if(saved?.status==="unavailable")return {label:"Status unavailable",kind:"off"};
 if(!emailState(b).ready)return {label:"Not eligible",kind:"off"};
 return approvedIds.has(b.id)?{label:"Approved · not sent",kind:"approved"}:{label:"Awaiting approval",kind:"off"};
}
function renderList(){
 const q=$("#search").value.trim().toLowerCase(),f=$("#status-filter").value;
 visible=bookings.filter(b=>{const st=emailState(b);const match=(family(b)+" "+(b.parent_email||"")).toLowerCase().includes(q);return match&&(f==="all"||(f==="ready"&&st.ready)||(f==="excluded"&&!st.ready))}).sort((a,b)=>new Date(a.visit_starts_at||0)-new Date(b.visit_starts_at||0));
 $("#list-count").textContent=visible.length+" shown across "+new Set(visible.map(b=>dayKey(b.visit_starts_at))).size+" visit days";
 const groups=new Map();visible.forEach(b=>{const k=dayKey(b.visit_starts_at);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(b)});
 $("#recipient-list").innerHTML=[...groups.entries()].map(([key,items])=>{const info=batchInfo(key),ready=items.filter(b=>emailState(b).ready).length;return '<section class="day-group"><div class="day-heading"><strong>'+esc(info.label)+'</strong><div class="day-meta"><span>'+items.length+' booking'+(items.length===1?"":"s")+' · '+ready+' ready to review</span><span>'+esc(info.due)+'</span></div></div>'+items.map(b=>{const st=emailState(b),mail=visibleEmailStatus(b),active=b.id===selectedId;return '<div class="recipient '+(active?"selected":"")+'" data-id="'+esc(b.id)+'"><div class="recipient-top"><div><strong>'+esc(family(b))+'</strong><small>'+esc(new Date(b.visit_starts_at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})||"Time TBC")+' · '+esc(b.parent_email||"No email address")+'</small></div><div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end"><span class="pill '+st.kind+'">'+esc(st.label)+'</span><span class="pill '+mail.kind+'">'+esc(mail.label)+'</span></div></div></div>'}).join("")+'</section>'}).join("")||'<div class="empty">No bookings match this filter.</div>';
 document.querySelectorAll("#recipient-list [data-id]").forEach(el=>el.addEventListener("click",()=>selectBooking(el.dataset.id)));
}
function renderApproval(){const eligible=bookings.filter(b=>emailState(b).ready);const approved=eligible.filter(b=>approvedIds.has(b.id));$("#approved-count").textContent=approved.length;$("#pending-count").textContent=eligible.length-approved.length;$("#blocked-count").textContent=bookings.length-eligible.length;const keys=new Set(bookings.map(b=>dayKey(b.visit_starts_at)));$("#day-count").textContent=keys.size;const groups=new Map();bookings.slice().sort((a,b)=>new Date(a.visit_starts_at||0)-new Date(b.visit_starts_at||0)).forEach(b=>{const k=dayKey(b.visit_starts_at);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(b)});$("#approval-groups").innerHTML=[...groups.entries()].map(([key,items])=>{const info=batchInfo(key),valid=items.filter(b=>emailState(b).ready),done=valid.filter(b=>approvedIds.has(b.id)).length;return '<section class="day-group"><div class="day-heading"><strong>'+esc(info.label)+'</strong><div class="day-meta"><span>'+done+' of '+valid.length+' eligible emails approved</span><span>'+esc(info.due)+'</span></div><div class="day-actions"><button class="secondary reset-day" data-day="'+esc(key)+'" '+(!done?"disabled":"")+'>Reset approvals</button><button class="secondary approve-day" data-day="'+esc(key)+'" '+(!valid.length||done===valid.length?"disabled":"")+'>Approve remaining eligible</button></div></div>'+items.map(b=>{const st=emailState(b),ok=approvedIds.has(b.id);return '<div class="approval-row"><div><strong>'+esc(family(b))+'</strong><small>'+esc(b.parent_email||"No email address")+'</small></div><div style="display:flex;align-items:center;gap:12px">'+(st.ready?'<label class="approval-check"><input type="checkbox" class="approval-toggle" data-id="'+esc(b.id)+'" '+(ok?"checked":"")+' aria-label="Approve email for '+esc(family(b))+'"><span>'+(ok?"Approved":"Approve")+'</span></label>':'<span class="approval-state pending">'+esc(st.label)+'</span>')+'<button class="secondary review-approval" data-id="'+esc(b.id)+'">Review</button></div></div>'}).join("")+'</section>'}).join("")||'<div class="empty">No bookings loaded.</div>';document.querySelectorAll(".approval-toggle").forEach(box=>box.addEventListener("change",async()=>{const b=bookings.find(x=>x.id===box.dataset.id);if(b)await saveApproval(b,box.checked)}));document.querySelectorAll(".reset-day").forEach(btn=>btn.addEventListener("click",async()=>{
 const key=btn.dataset.day;
 if(approvalBusy)return;approvalBusy=true;
 try{await approvalRequest("POST",{action:"reset",visitDate:key,leadDays:Number($("#lead-days").value)});bookings.filter(b=>dayKey(b.visit_starts_at)===key).forEach(b=>approvedIds.delete(b.id))}
 catch(e){alert(e.message||"Could not reset approvals. Please try again.")}
 finally{approvalBusy=false;renderApproval();if(selectedId)selectBooking(selectedId)}
}));document.querySelectorAll(".approve-day").forEach(btn=>btn.addEventListener("click",async()=>{
 const key=btn.dataset.day;const targets=bookings.filter(b=>dayKey(b.visit_starts_at)===key&&emailState(b).ready&&!approvedIds.has(b.id));
 if(approvalBusy)return;approvalBusy=true;let failed=0;
 try{for(const b of targets){try{await approvalRequest("POST",{action:"set",bookingId:b.id,approved:true,leadDays:Number($("#lead-days").value),visitDate:key});approvedIds.add(b.id)}catch(e){failed++}}}
 finally{approvalBusy=false;renderApproval();if(selectedId)selectBooking(selectedId)}
 if(failed)alert(failed+" approval(s) could not be saved. Please review the affected bookings.");
}));document.querySelectorAll(".review-approval").forEach(btn=>btn.addEventListener("click",()=>{document.querySelector('[data-tab="recipients"]').click();selectBooking(btn.dataset.id)}));$("#send-summary").textContent=approved.length?approved.length+" approved booking emails are in the proposed batch. No messages will be sent from this preview.":"No emails have been approved yet.";$("#final-check").disabled=!approved.length;$("#final-check-result").innerHTML="";}
function finalBatchCheck(){const approved=bookings.filter(b=>approvedIds.has(b.id)&&emailState(b).ready);const sent=approved.filter(b=>testStatusById.get(b.id)?.status==="sent").length;const remaining=approved.length-sent;const duplicateMap=new Map();approved.filter(b=>!testStatusById.get(b.id)?.attempted).forEach(b=>{const key=b.parent_email.trim().toLowerCase();duplicateMap.set(key,(duplicateMap.get(key)||0)+1)});const duplicate=[...duplicateMap.values()].filter(n=>n>1).reduce((a,n)=>a+n,0);$("#final-check-result").innerHTML='<div class="notice"><strong>Approved batch review</strong><p>'+approved.length+' approved booking emails.</p><p>'+sent+' already have a recorded test send; '+remaining+' have no recorded test send.</p><p>'+duplicate+' potential duplicate recipient addresses need attention.</p><p><strong>Live parent email delivery is deliberately disabled in development.</strong> This review does not send any messages.</p></div>';}
async function load(){const {data:{user},error:userError}=await sb.auth.getUser();if(userError)console.warn(userError);if(!user){$("#login-panel").classList.remove("hidden");return}const {data:allowed,error:authError}=await sb.rpc("is_santa_admin");if(authError||!allowed){$("#login-panel").classList.remove("hidden");$("#login-message").textContent=authError?.message||"This account is not authorised as a Santa administrator.";return}$("#app").classList.remove("hidden");$("#signout").classList.remove("hidden");const {data,error}=await sb.from("santa_bookings").select("id,status,parent_first_name,parent_last_name,parent_email,visit_starts_at,santa_children(id,preferred_name,age)").order("visit_starts_at");if(error){$("#recipient-list").innerHTML='<div class="empty">Could not load bookings: '+esc(error.message)+'</div>';return}bookings=data||[];try{await loadSavedApprovals()}catch(e){console.error(e);$("#recipient-list").innerHTML="<div class=empty>Could not load saved approvals. Please refresh and try again.</div>";return}counts();renderList();renderApproval();loadTestStatuses();const first=bookings.find(b=>emailState(b).ready)||bookings[0];if(first)selectBooking(first.id)}
$("#login-button").onclick=async()=>{const {error}=await sb.auth.signInWithPassword({email:$("#login-email").value.trim(),password:$("#login-password").value});if(error)$("#login-message").textContent=error.message;else{ $("#login-panel").classList.add("hidden");await load() }};
$("#signout").onclick=async()=>{await sb.auth.signOut();location.reload()};
$("#search").oninput=renderList;$("#status-filter").onchange=renderList;$("#lead-days").onchange=async()=>{
 localStorage.setItem("hexhamSantaEmailLeadDays",$("#lead-days").value);
 approvedIds.clear();renderList();renderApproval();
 try{await loadSavedApprovals();renderList();renderApproval();testStatusById.clear();loadTestStatuses();if(selectedId)selectBooking(selectedId)}
 catch(e){alert("Could not load saved approvals for this lead time. Please refresh and try again.");console.error(e)}
};$("#final-check").onclick=finalBatchCheck;
document.querySelectorAll("[data-tab]").forEach(btn=>btn.onclick=()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===btn));$("#recipients-tab").classList.toggle("hidden",btn.dataset.tab!=="recipients");$("#preview-tab").classList.toggle("hidden",btn.dataset.tab!=="preview");$("#approval-tab").classList.toggle("hidden",btn.dataset.tab!=="approval");if(btn.dataset.tab==="approval")renderApproval()});
load();