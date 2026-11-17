const sb=window.supabase.createClient("https://atqhqizzfnsokulmupmy.supabase.co","sb_publishable_-TvnUkpHRB9jkkNqJQAXCA_tkaAeY7_");
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function formatDateTime(value){if(!value)return "Time not set";return new Date(value).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});}
function message(t){$("#msg").textContent=t;$("#msg").classList.remove("hidden");}
async function bootstrap(){const {data,error}=await sb.rpc("bootstrap_first_santa_admin");if(error)return {ok:false,error};return {ok:Boolean(data)};}
async function loadAuth(){
 const {data:{user}}=await sb.auth.getUser();
 if(!user){$("#auth").classList.remove("hidden");$("#app").classList.add("hidden");return;}
 const boot=await bootstrap();
 if(!boot.ok){$("#auth").classList.remove("hidden");$("#app").classList.add("hidden");message(boot.error?.message||"This account is not authorised as a Santa admin.");return;}
 $("#auth").classList.add("hidden");$("#app").classList.remove("hidden");$("#who").textContent=user.email||"Signed in";
 await loadBoxOfficeEvents();
}
let boxOfficeEvents = [];
let calendarMonth = null;
let calendarMonthRange = [];
let currentBoxOfficeAttemptId = null;

function boxOfficeDateKey(value){
 return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
}
function monthKey(date){return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")}
function renderBoxOfficeCalendar(){
 const host=$("#bo-date-overview");if(!host)return;
 if(!boxOfficeEvents.length){host.innerHTML='<p class="calendar-empty">No upcoming published sessions are available.</p>';return}
 const keys=boxOfficeEvents.map(e=>boxOfficeDateKey(e.start)).sort();
 const first=new Date(keys[0]+"T12:00:00"),last=new Date(keys[keys.length-1]+"T12:00:00");
 const minMonth=new Date(first.getFullYear(),first.getMonth(),1),maxMonth=new Date(last.getFullYear(),last.getMonth(),1);
 calendarMonthRange=[];for(let d=new Date(minMonth);d<=maxMonth;d.setMonth(d.getMonth()+1))calendarMonthRange.push(monthKey(d));
 if(!calendarMonth||!calendarMonthRange.includes(calendarMonth))calendarMonth=monthKey(new Date());
 if(!calendarMonthRange.includes(calendarMonth))calendarMonth=calendarMonthRange[0];
 const [year,month]=calendarMonth.split("-").map(Number),monthStart=new Date(year,month-1,1),daysInMonth=new Date(year,month,0).getDate();
 const firstWeekday=(monthStart.getDay()+6)%7;
 const byDate={};
 boxOfficeEvents.forEach(event=>{
  const key=boxOfficeDateKey(event.start),bucket=byDate[key]||(byDate[key]={events:[],total:0,remaining:0});
  bucket.events.push(event);
  (event.ticket_types||[]).forEach(ticket=>{
   const total=Math.max(0,Number(ticket.quantity_total)||0),remaining=Math.max(0,Math.min(total,Number(ticket.remaining)||0));
   bucket.total+=total;bucket.remaining+=remaining;
  });
 });
 const weekdayNames=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
 let html='<div class="calendar-heading"><button type="button" class="secondary calendar-nav" id="bo-calendar-prev" '+(calendarMonth===calendarMonthRange[0]?'disabled':'')+'>‹</button><strong>'+monthStart.toLocaleDateString("en-GB",{month:"long",year:"numeric"})+'</strong><button type="button" class="secondary calendar-nav" id="bo-calendar-next" '+(calendarMonth===calendarMonthRange[calendarMonthRange.length-1]?'disabled':'')+'>›</button></div>';
 html+='<div class="calendar-grid calendar-weekdays">'+weekdayNames.map(d=>'<span>'+d+'</span>').join("")+'</div><div class="calendar-grid">';
 for(let i=0;i<firstWeekday;i++)html+='<span class="calendar-blank"></span>';
 for(let day=1;day<=daysInMonth;day++){
  const key=year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0"),bucket=byDate[key];
  if(!bucket){html+='<span class="calendar-day empty"><strong>'+day+'</strong></span>';continue}
  const sold=bucket.total-bucket.remaining,rate=bucket.total>0?sold/bucket.total:0;
  const level=bucket.remaining===0?"soldout":rate>=.8?"busy":rate>=.5?"filling":"quiet";
  const label=bucket.remaining>0?bucket.remaining+" places left":"Sold out";
  html+='<button type="button" class="calendar-day '+level+'" data-calendar-date="'+key+'" '+(bucket.remaining>0?'':'disabled')+'><strong>'+day+'</strong><span>'+bucket.events.length+' '+(bucket.events.length===1?'session':'sessions')+'</span><span>'+label+'</span></button>';
 }
 html+='</div><div class="calendar-legend"><span><i class="quiet"></i> Quiet</span><span><i class="filling"></i> Filling</span><span><i class="busy"></i> Nearly full</span><span><i class="soldout"></i> Sold out</span><span><i class="empty"></i> No sessions</span></div>';
 host.innerHTML=html;
 $("#bo-calendar-prev")?.addEventListener("click",()=>{const i=calendarMonthRange.indexOf(calendarMonth);if(i>0){calendarMonth=calendarMonthRange[i-1];renderBoxOfficeCalendar()}});
 $("#bo-calendar-next")?.addEventListener("click",()=>{const i=calendarMonthRange.indexOf(calendarMonth);if(i<calendarMonthRange.length-1){calendarMonth=calendarMonthRange[i+1];renderBoxOfficeCalendar()}});
 host.querySelectorAll("[data-calendar-date]").forEach(button=>button.addEventListener("click",()=>selectBoxOfficeDate(button.dataset.calendarDate)));
}
function selectBoxOfficeDate(date){
 const dateSelect=$("#bo-date");if(!dateSelect)return;
 if(![...dateSelect.options].some(option=>option.value===date))return;
 dateSelect.value=date;dateSelect.dispatchEvent(new Event("change"));
 dateSelect.scrollIntoView({behavior:"smooth",block:"center"});
}
function boxOfficeMessage(text, isError=false){
 const el=$("#bo-message"); if(!el)return;
 el.textContent=text; el.classList.remove("hidden");
 el.style.background=isError?"#f3d8d8":"#eee3cc";
}
function formatBoxOfficePrice(ticket){
 const amount=Number(ticket?.price);
 if(!Number.isFinite(amount))return "Price unavailable";
 return amount===0?"Free":new Intl.NumberFormat("en-GB",{style:"currency",currency:String(ticket.currency||"gbp").toUpperCase()}).format(amount/100);
}
function renderBoxOfficeChildren(){
 const count=Number($("#bo-count")?.value||1), host=$("#bo-children");
 if(!host)return;
 host.innerHTML=Array.from({length:count},(_,i)=>'<div class="booking" style="margin-top:12px"><strong>Child '+(i+1)+'</strong><label>Child name</label><input data-bo-child-name="'+i+'" required><div class="row"><div style="flex:1"><label>Age</label><input data-bo-child-age="'+i+'" type="number" min="0" max="18"></div><div style="flex:2"><label>Interests</label><input data-bo-child-interests="'+i+'"></div></div><label>Anything Santa should mention</label><textarea data-bo-child-notes="'+i+'" rows="2"></textarea></div>').join("");
}
async function loadBoxOfficeEvents(){
 const select=$("#bo-event"); if(!select)return;
 select.innerHTML='<option value="">Loading sessions…</option>';
 try{
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token)throw new Error("Your sign-in has expired. Please sign out and sign in again.");
  const response=await fetch("/api/box-office-events",{headers:{Authorization:"Bearer "+session.access_token}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||"Could not load sessions.");
  const now=Date.now();
  boxOfficeEvents=(data.events||[]).map(event=>({...event,ticket_types:(event.ticket_types||[]).filter(ticket=>ticket.status==="on_sale")})).filter(event=>Number.isFinite(Date.parse(event.start||""))&&Date.parse(event.start)>now&&!event.unavailable&&event.ticket_types.length>0).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  renderBoxOfficeCalendar();
  const dateSelect=$("#bo-date");
  const bookableEvents=boxOfficeEvents.filter(event=>event.ticket_types.some(ticket=>Number(ticket.remaining)>0));
  const dates=[...new Set(bookableEvents.map(e=>boxOfficeDateKey(e.start)))];
  dateSelect.innerHTML=dates.length?'<option value="">Choose an available date</option>'+dates.map(date=>'<option value="'+date+'">'+new Date(date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Europe/London"})+'</option>').join(""):'<option value="">No future dates with available tickets</option>';
  select.innerHTML='<option value="">Choose a date first</option>';
  select.disabled=true;
 }catch(error){select.innerHTML='<option value="">Sessions unavailable</option>';const dateSelect=$("#bo-date");if(dateSelect)dateSelect.innerHTML='<option value="">Could not load dates</option>';boxOfficeMessage(error.message||"Could not load available dates. Please try signing in again.",true)}
}
function updateBoxOfficeTicketTypes(){
 const event=boxOfficeEvents.find(e=>e.id===$("#bo-event")?.value), select=$("#bo-ticket"), info=$("#bo-availability");
 if(!select||!info)return;
 if(!event){select.innerHTML='<option value="">Choose a session first</option>';select.disabled=true;info.textContent="Choose a session to see live ticket availability.";return}
 const tickets=event.ticket_types||[];
 select.innerHTML='<option value="">Choose ticket type</option>'+tickets.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+' · '+esc(formatBoxOfficePrice(t))+' · '+t.remaining+' available</option>').join("");
 select.disabled=!tickets.length;
 info.textContent=event.unavailable?"Ticket sales are currently unavailable.":tickets.length?tickets.map(t=>t.name+": "+formatBoxOfficePrice(t)+" each, "+t.remaining+" remaining").join(" · "):"No box office ticket types are available for this session.";
}
async function submitBoxOfficeBooking(){
 const event=boxOfficeEvents.find(e=>e.id===$("#bo-event").value), ticket=event?.ticket_types?.find(t=>t.id===$("#bo-ticket").value);
 if(!event||!ticket)return boxOfficeMessage("Choose a session and ticket type first.",true);
 const children=Array.from({length:Number($("#bo-count").value)},(_,i)=>({
  preferred_name:$('[data-bo-child-name="'+i+'"]').value.trim(),
  age:$('[data-bo-child-age="'+i+'"]').value,
  interests:$('[data-bo-child-interests="'+i+'"]').value.trim(),
  santa_notes:$('[data-bo-child-notes="'+i+'"]').value.trim()
 }));
 const parent={first_name:$("#bo-first").value.trim(),last_name:$("#bo-last").value.trim(),email:$("#bo-email").value.trim(),phone:$("#bo-phone").value.trim()};
 const emailDetails=$("#bo-email-child-details")?.checked===true;
 if(!parent.first_name||!parent.last_name||!parent.email||(!emailDetails&&children.some(c=>!c.preferred_name)))return boxOfficeMessage("Enter the parent’s name and email, and a name for every child unless you are emailing the details form.",true);
 if(children.some(c=>c.age!==""&&(!Number.isInteger(Number(c.age))||Number(c.age)<0||Number(c.age)>18)))return boxOfficeMessage("Child ages must be between 0 and 18.",true);
 if(ticket.remaining<children.length)return boxOfficeMessage("There are not enough tickets remaining for this booking.",true);
 const unitPrice=Number(ticket.price)/100;
 if(!Number.isFinite(unitPrice)||unitPrice<0)return boxOfficeMessage("Ticket Tailor has not returned a valid price for this ticket type. Do not take payment.",true);
 const totalPrice=unitPrice*children.length;
 const priceLabel=new Intl.NumberFormat("en-GB",{style:"currency",currency:String(ticket.currency||"gbp").toUpperCase()}).format(totalPrice);
 if(!confirm("Issue "+children.length+" Ticket Tailor ticket(s) for "+parent.first_name+" "+parent.last_name+"?\n\nTicket price: "+formatBoxOfficePrice(ticket)+" each\nTotal to collect: "+priceLabel+"\n\nConfirm that the full payment has been received."))return;
 const button=$("#bo-submit");button.disabled=true;button.textContent="Creating booking…";
 boxOfficeMessage("Checking live availability and issuing tickets. Please do not close this page or submit again.");
 try{
  const {data:{session}}=await sb.auth.getSession();
  const response=await fetch("/api/create-in-person-booking",{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({
   idempotency_key:currentBoxOfficeAttemptId||(currentBoxOfficeAttemptId=crypto.randomUUID()),event_id:event.id,event_series_id:event.event_series_id,ticket_type_id:ticket.id,
   event_name:event.name,visit_starts_at:event.start,visit_ends_at:event.end,parent,children,payment_method:$("#bo-payment").value,child_details_mode:emailDetails?"email":"now"
  })});
  const result=await response.json();
  if(!response.ok||!result.ok){
   if(result.recovery_required){
    currentBoxOfficeAttemptId=result.attempt_id||currentBoxOfficeAttemptId;
    $("#bo-recover").classList.remove("hidden");
   }
   boxOfficeMessage(result.message||result.error||"Booking could not be completed. Do not submit this sale again until it has been reconciled.",true);
   return;
  }
  currentBoxOfficeAttemptId=null;$("#bo-recover").classList.add("hidden");
  boxOfficeMessage("Booking created successfully. "+children.length+" Ticket Tailor ticket(s) issued at "+formatBoxOfficePrice(ticket)+" each ("+priceLabel+" total). "+(emailDetails?"A secure parent details email was requested. ":"")+"The booking is now in the dashboard.");
  ["#bo-first","#bo-last","#bo-email","#bo-phone"].forEach(id=>$(id).value="");
  $("#bo-count").value="1";$("#bo-email-child-details").checked=false;renderBoxOfficeChildren();await load();await loadBoxOfficeEvents();
 }catch(error){boxOfficeMessage(error.message||"Booking request failed. Do not submit again until the attempt has been reconciled.",true);$("#bo-recover").classList.remove("hidden");}
 finally{button.disabled=false;button.textContent="Create booking and issue tickets"}
}


async function recoverBoxOfficeAttempt(){
 if(!currentBoxOfficeAttemptId)return boxOfficeMessage("There is no incomplete attempt to reconcile.",true);
 const button=$("#bo-recover");button.disabled=true;button.textContent="Checking Ticket Tailor…";
 try{
  const {data:{session}}=await sb.auth.getSession();
  const response=await fetch("/api/recover-box-office-attempt",{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({attempt_id:currentBoxOfficeAttemptId})});
  const result=await response.json();
  if(result.ok&&result.complete){
   currentBoxOfficeAttemptId=null;button.classList.add("hidden");
   boxOfficeMessage("Recovery complete. The existing tickets have been reconciled and the booking is now in the dashboard.");
   await load();
  }else{
   if(result.recovery_required)button.classList.remove("hidden");
   boxOfficeMessage(result.message||result.error||"Recovery is still required. Do not submit this sale again.",true);
  }
 }catch(error){boxOfficeMessage(error.message||"Could not reconcile this attempt. Do not submit it again.",true)}
 finally{button.disabled=false;button.textContent="Reconcile incomplete booking"}
}

$("#signup").onclick=async()=>{const email=$("#email").value.trim(),password=$("#password").value;if(password.length<8)return message("Use a password of at least 8 characters.");const {data,error}=await sb.auth.signUp({email,password});if(error)return message(error.message);if(data.session){loadAuth();return;}message("Account created. Check your email if Supabase asks you to confirm the account, then sign in.");};
$("#login").onclick=async()=>{const button=$("#login"),email=$("#email").value.trim(),password=$("#password").value;if(!email||!password)return message("Enter your email address and password.");button.disabled=true;button.textContent="Signing in…";$("#msg").classList.add("hidden");try{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;if(!data?.user)throw new Error("Supabase did not return a signed-in user.");await loadAuth();}catch(error){message(error?.message||"Sign-in failed. Please try again.");}finally{button.disabled=false;button.textContent="Sign in";}};
$("#logout").onclick=async()=>{await sb.auth.signOut();loadAuth();};
$("#bo-date").addEventListener("change",()=>{
 const date=$("#bo-date").value, sessions=boxOfficeEvents.filter(e=>boxOfficeDateKey(e.start)===date&&e.ticket_types.some(t=>Number(t.remaining)>0));
 const select=$("#bo-event");select.innerHTML=sessions.length?'<option value="">Choose a session</option>'+sessions.map(e=>'<option value="'+esc(e.id)+'">'+esc(new Date(e.start).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}))+' · '+esc(e.name||"Santa session")+'</option>').join(""):'<option value="">No available sessions on this date</option>';
 select.disabled=!sessions.length;$("#bo-ticket").innerHTML='<option value="">Choose a session first</option>';$("#bo-ticket").disabled=true;$("#bo-availability").textContent="Choose a session to see ticket availability.";
});
$("#bo-event").addEventListener("change",updateBoxOfficeTicketTypes);
$("#bo-submit").addEventListener("click",submitBoxOfficeBooking);
$("#bo-recover").addEventListener("click",recoverBoxOfficeAttempt);
$("#bo-count").addEventListener("change",renderBoxOfficeChildren);
renderBoxOfficeChildren();
loadAuth();
