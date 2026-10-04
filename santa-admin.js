const sb=window.supabase.createClient("https://atqhqizzfnsokulmupmy.supabase.co","sb_publishable_-TvnUkpHRB9jkkNqJQAXCA_tkaAeY7_");
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function message(t){$("#msg").textContent=t;$("#msg").classList.remove("hidden")}
function formatDateTime(value){
  if(!value)return "Time not set";
  return new Date(value).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
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
async function load(){
 const {data:{user}}=await sb.auth.getUser();
 if(!user){$("#auth").classList.remove("hidden");$("#app").classList.add("hidden");return}
 const boot=await bootstrap();
 if(!boot.ok){
   $("#auth").classList.remove("hidden");$("#app").classList.add("hidden");
   message(boot.error?.message||"This account is not authorised as a Santa admin.");
   return;
 }
 $("#auth").classList.add("hidden");$("#app").classList.remove("hidden");$("#who").textContent=user.email||"Signed in";
 const {data,error}=await sb.from("santa_bookings").select("*,santa_children(*)").order("visit_starts_at");
 if(error){$("#bookings").innerHTML="<p>"+esc(error.message)+"</p>";return}
 const bookings=data||[];
 $("#booking-count").textContent=bookings.length+" booking"+(bookings.length===1?"":"s");
 $("#bookings").innerHTML=bookings.map(bookingCard).join("")||"<p>No bookings yet.</p>";
}
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