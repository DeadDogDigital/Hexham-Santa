const sb=window.supabase.createClient("https://atqhqizzfnsokulmupmy.supabase.co","sb_publishable_-TvnUkpHRB9jkkNqJQAXCA_tkaAeY7_");
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function message(t){$("#msg").textContent=t;$("#msg").classList.remove("hidden")}
async function load(){
 const {data:{user}}=await sb.auth.getUser();
 if(!user){$("#auth").classList.remove("hidden");$("#app").classList.add("hidden");return}
 $("#auth").classList.add("hidden");$("#app").classList.remove("hidden");$("#who").textContent=user.email||"Signed in";
 const {data,error}=await sb.from("santa_bookings").select("*,santa_children(*)").order("visit_starts_at");
 if(error){$("#bookings").innerHTML='<p>'+esc(error.message)+'</p>';return}
 $("#bookings").innerHTML=(data||[]).map(b=>'<div class="row"><div><strong>'+esc((b.parent_first_name||"")+" "+(b.parent_last_name||""))+'</strong><div class="muted">'+esc(b.parent_email||"")+' · '+(b.visit_starts_at?new Date(b.visit_starts_at).toLocaleString("en-GB"):"")+'</div><div>'+((b.santa_children||[]).map(c=>esc(c.preferred_name)+(c.age!=null?" ("+c.age+")":"")).join(", ")||"No child details")+'</div></div><div>'+esc(b.status)+'</div></div>').join("")||'<p>No bookings yet.</p>';
}
$("#signup").onclick=async()=>{const email=$("#email").value.trim(),password=$("#password").value;if(password.length<8)return message("Use a password of at least 8 characters.");const {error}=await sb.auth.signUp({email,password});message(error?error.message:"Account created. Once approved as a Santa admin, sign in here.")};
$("#login").onclick=async()=>{const {error}=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error)message(error.message);else load()};
$("#logout").onclick=async()=>{await sb.auth.signOut();load()};load();