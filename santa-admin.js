const sb=window.supabase.createClient("https://atqhqizzfnsokulmupmy.supabase.co","sb_publishable_-TvnUkpHRB9jkkNqJQAXCA_tkaAeY7_");
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
let allBookings=[];
let filterMode="all";
let filterDate=null;

function message(t){$("#msg").textContent=t;$("#msg").classList.remove("hidden")}
function formatDateTime(value){
  if(!value)return "Time not set";
  return new Date(value).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function dateKey(value){
  if(!value)return "";
  const d=new Date(value);
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+day;
}
function shortDate(value){
  if(!value)return "";
  return new Date(value).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}
async function bootstrap(){
  const {data,error}=await sb.rpc("bootstrap_first_santa_admin");
  if(error)return {ok:false,error};
  return {ok:Boolean(data)};
}
function bookingCard(b){
  const children=b.santa_children||[];
  const status=String(b.status||"confirmed").toLowerCase();
  const statusLabel=status==="cancelled"?"CANCELLED":"CONFIRMED";
  const statusClass=status==="cancelled"?"cancelled":"confirmed";
  const childHtml=children.length?children.map(c=>'<div class="child"><div class="child-head"><strong>🎅 '+esc(c.preferred_name||"Unnamed child")+'</strong>'+(c.age!=null?'<span>Age '+esc(c.age)+'</span>':"")+'</div><div class="child-detail"><strong>❤️ Loves:</strong> '+esc(c.interests||"Not provided")+'</div><div class="child-detail"><strong>💬 Santa should mention:</strong> '+esc(c.santa_notes||"Nothing noted")+'</div></div>').join(""):'<p class="muted">No child details recorded.</p>';
  return '<article class="booking '+statusClass+'"><div class="booking-top"><div><div class="visit-time">'+esc(formatDateTime(b.visit_starts_at))+'</div><div class="parent">'+esc(((b.parent_first_name||"")+" "+(b.parent_last_name||"")).trim()||"Parent name not provided")+'</div><div class="muted">'+esc(b.parent_email||"No email")+(b.parent_phone?" · "+esc(b.parent_phone):"")+'</div></div><span class="status '+statusClass+'">'+statusLabel+'</span></div><div class="children">'+childHtml+'</div></article>';
}
function nextSessionStart(){
  const now=Date.now();
  const future=allBookings.filter(b=>b.visit_starts_at&&new Date(b.visit_starts_at).getTime()>=now).sort((a,b)=>new Date(a.visit_starts_at)-new Date(b.visit_starts_at));
  return future.length?new Date(future[0].visit_starts_at).getTime():null;
}
function render(){
  let bookings=[...allBookings];
  const session=nextSessionStart();
  if(filterMode==="next"&&session!==null) bookings=bookings.filter(b=>b.visit_starts_at&&new Date(b.visit_starts_at).getTime()===session);
  else if(filterMode==="today"){const key=dateKey(new Date());bookings=bookings.filter(b=>dateKey(b.visit_starts_at)===key)}
  else if(filterMode==="tomorrow"){const d=new Date();d.setDate(d.getDate()+1);bookings=bookings.filter(b=>dateKey(b.visit_starts_at)===dateKey(d))}
  else if(filterMode==="date"&&filterDate) bookings=bookings.filter(b=>dateKey(b.visit_starts_at)===filterDate);
  const confirmed=bookings.filter(b=>String(b.status||"confirmed").toLowerCase()!=="cancelled");
  $("#booking-count").textContent=bookings.length+" booking"+(bookings.length===1?"":"s")+(confirmed.length!==bookings.length?" · "+confirmed.length+" active":"");
  let title="All bookings";
  if(filterMode==="next") title=session===null?"No upcoming sessions":("Next session · "+formatDateTime(new Date(session)));
  if(filterMode==="today") title="Today · "+shortDate(new Date());
  if(filterMode==="tomorrow"){const d=new Date();d.setDate(d.getDate()+1);title="Tomorrow · "+shortDate(d)}
  if(filterMode==="date"&&filterDate) title="Selected date · "+shortDate(filterDate+"T12:00:00");
  $("#selection-title").textContent=" · "+title;
  $("#bookings").innerHTML=bookings.map(bookingCard).join("")||"<p>No bookings match this view.</p>";
  $$(".filter-buttons button").forEach(btn=>btn.classList.toggle("active",btn.dataset.filter===filterMode));
  document.title="Hexham Santa — "+title;
}
async function load(){
 const {data:{user}}=await sb.auth.getUser();
 if(!user){$("#auth").classList.remove("hidden");$("#app").classList.add("hidden");return}
 const boot=await bootstrap();
 if(!boot.ok){$("#auth").classList.remove("hidden");$("#app").classList.add("hidden");message(boot.error?.message||"This account is not authorised as a Santa admin.");return}
 $("#auth").classList.add("hidden");$("#app").classList.remove("hidden");$("#who").textContent=user.email||"Signed in";
 const {data,error}=await sb.from("santa_bookings").select("*,santa_children(*)").order("visit_starts_at");
 if(error){$("#bookings").innerHTML="<p>"+esc(error.message)+"</p>";return}
 allBookings=data||[];
 render();
}
$$(".filter-buttons button").forEach(btn=>btn.onclick=()=>{filterMode=btn.dataset.filter;filterDate=null;$("#date-filter").value="";render()});
$("#date-filter").onchange=()=>{filterDate=$("#date-filter").value;filterMode=filterDate?"date":"all";render()};
$("#print").onclick=()=>window.print();
$("#signup").onclick=async()=>{
 const email=$("#email").value.trim(),password=$("#password").value;
 if(password.length<8)return message("Use a password of at least 8 characters.");
 const {data,error}=await sb.auth.signUp({email,password});
 if(error)return message(error.message);
 if(data.session){load();return}
 message("Account created. Check your email if Supabase asks you to confirm the account, then sign in.");
};
$("#login").onclick=async()=>{
 const {error}=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});
 if(error)message(error.message);else load();
};
$("#logout").onclick=async()=>{await sb.auth.signOut();load()};
load();