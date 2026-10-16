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
function isGroupBooking(b){
  if(!b.visit_starts_at)return false;
  const d=new Date(b.visit_starts_at);
  return d.getHours()<15;
}
function isCancelled(b){return String(b.status||"confirmed").toLowerCase()==="cancelled"}
function bookingCard(b){
  const children=b.santa_children||[];
  const status=String(b.status||"confirmed").toLowerCase();
  const statusLabel=status==="cancelled"?"CANCELLED":"CONFIRMED";
  const statusClass=status==="cancelled"?"cancelled":"confirmed";
  const selected=Boolean(b.group_print_selected);
  const checkedIn=Boolean(b.checked_in_at);
  const childHtml=children.length?children.map(c=>{
    const photo=c.photo_url?'<img class="child-photo" src="'+esc(c.photo_url)+'" alt="Photo of '+esc(c.preferred_name||"child")+'">':'<div class="child-photo-placeholder" aria-label="No photo added">🎅</div>';
    const photoActions='<div class="photo-actions print-hide"><button type="button" class="secondary" data-upload-photo="'+esc(c.id)+'">'+(c.photo_path?"Replace photo":"Add photo")+'</button>'+(c.photo_path?'<button type="button" class="secondary" data-remove-photo="'+esc(c.id)+'">Remove</button>':"")+'<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input="'+esc(c.id)+'" hidden></div>';
    return '<div class="child"><div class="child-photo-row">'+photo+'<div><div class="child-head"><strong>🎅 '+esc(c.preferred_name||"Unnamed child")+'</strong>'+(c.age!=null?'<span>Age '+esc(c.age)+'</span>':"")+'</div><div class="child-detail"><strong>❤️ Loves:</strong> '+esc(c.interests||"Not provided")+'</div><div class="child-detail"><strong>💬 Santa should mention:</strong> '+esc(c.santa_notes||"Nothing noted")+'</div>'+photoActions+'</div></div></div>';
  }).join(""):'<p class="muted">No child details recorded.</p>';
  const token=String(b.treat_booklet_id||"").trim();
  const url=token?"https://giftlocal.netlify.app/treats/"+encodeURIComponent(token):"";
  const treatsHtml=token
    ?'<div class="treats-box"><h3>🎁 Santa’s Local Treats</h3><p>Personal family booklet is linked and ready.</p><button type="button" data-show-qr="'+esc(b.id)+'">SHOW FAMILY QR</button><p class="muted">Display this QR at departure so the family can open their personal treats booklet.</p></div>'
    :'<div class="treats-box"><h3>🎁 Santa’s Local Treats</h3><p>No personal booklet is linked to this booking yet.</p></div>';
  const groupControls=isGroupBooking(b)&&!isCancelled(b)?'<div class="booking-actions print-hide"><label class="group-select"><input type="checkbox" data-group-select="'+esc(b.id)+'" '+(selected?"checked":"")+'> Include in group print list</label><label class="checkin-control"><input type="checkbox" data-checkin="'+esc(b.id)+'" '+(checkedIn?"checked":"")+'> Checked in</label>'+(checkedIn?'<span class="checkin-label">✓ Arrived</span>':"")+'</div>':"";
  return '<article class="booking '+statusClass+(selected?' group-selected':'')+'" data-booking-card="'+esc(b.id)+'"><div class="booking-top"><div><div class="visit-time">'+esc(formatDateTime(b.visit_starts_at))+(isGroupBooking(b)?' <span class="muted" style="font-size:.8em">· GROUP</span>':' <span class="muted" style="font-size:.8em">· PRIVATE</span>')+'</div><div class="parent">'+esc(((b.parent_first_name||"")+" "+(b.parent_last_name||"")).trim()||"Parent name not provided")+'</div><div class="muted">'+esc(b.parent_email||"No email")+(b.parent_phone?" · "+esc(b.parent_phone):"")+'</div></div><span class="status '+statusClass+'">'+statusLabel+'</span></div>'+groupControls+'<button type="button" class="booking-toggle" aria-expanded="false" data-toggle-booking="'+esc(b.id)+'">View booking details ＋</button><div class="booking-details hidden" id="details-'+esc(b.id)+'"><h3>Visit details</h3><p><strong>Visit time:</strong> '+esc(formatDateTime(b.visit_starts_at))+'</p><p><strong>Visit type:</strong> '+(isGroupBooking(b)?"Group visit":"Private visit")+'</p><p><strong>Parent:</strong> '+esc(((b.parent_first_name||"")+" "+(b.parent_last_name||"")).trim()||"Not provided")+'</p><p><strong>Email:</strong> '+esc(b.parent_email||"Not provided")+'</p><p><strong>Phone:</strong> '+esc(b.parent_phone||"Not provided")+'</p><h3>Children and Santa notes</h3><div class="children">'+childHtml+'</div>'+treatsHtml+'</div></article>';
}
function showFamilyQr(bookingId){
  const b=allBookings.find(item=>item.id===bookingId);
  const token=String(b?.treat_booklet_id||"").trim();
  if(!token){alert("There isn't a Treats booklet linked to this booking yet.");return;}
  const url="https://giftlocal.netlify.app/treats/"+encodeURIComponent(token);
  if(typeof qrcode!=="function"){alert("The QR-code library did not load. Please refresh and try again.");return;}
  const qr=qrcode(0,"M");
  qr.addData(url);
  qr.make();
  const overlay=document.createElement("div");
  overlay.className="qr-overlay";
  overlay.setAttribute("role","dialog");
  overlay.setAttribute("aria-modal","true");
  overlay.innerHTML='<div class="qr-panel"><p class="muted">HEXHAM SANTA • DEPARTURE</p><h2>🎁 Your Santa’s Local Treats</h2><p>Scan this code to open your family’s personal booklet.</p><img alt="Family Treats booklet QR code" src="'+qr.createDataURL(8,4)+'"><p class="qr-url">'+esc(url)+'</p><button type="button" id="close-family-qr">Close</button></div>';
  document.body.appendChild(overlay);
  overlay.querySelector("#close-family-qr").onclick=()=>overlay.remove();
  overlay.addEventListener("click",event=>{if(event.target===overlay)overlay.remove()});
  document.addEventListener("keydown",function closeOnEscape(event){if(event.key==="Escape"){overlay.remove();document.removeEventListener("keydown",closeOnEscape)}});
}
function nextSessionStart(){
  const now=Date.now();
  const future=allBookings.filter(b=>b.visit_starts_at&&new Date(b.visit_starts_at).getTime()>=now).sort((a,b)=>new Date(a.visit_starts_at)-new Date(b.visit_starts_at));
  return future.length?new Date(future[0].visit_starts_at).getTime():null;
}
function currentVisibleBookings(){
  let bookings=[...allBookings];
  const session=nextSessionStart();
  if(filterMode==="next"&&session!==null) bookings=bookings.filter(b=>b.visit_starts_at&&new Date(b.visit_starts_at).getTime()===session);
  else if(filterMode==="today"){const key=dateKey(new Date());bookings=bookings.filter(b=>dateKey(b.visit_starts_at)===key)}
  else if(filterMode==="tomorrow"){const d=new Date();d.setDate(d.getDate()+1);bookings=bookings.filter(b=>dateKey(b.visit_starts_at)===dateKey(d))}
  else if(filterMode==="date"&&filterDate) bookings=bookings.filter(b=>dateKey(b.visit_starts_at)===filterDate);
  return bookings;
}
function render(){
  const bookings=currentVisibleBookings();
  const session=nextSessionStart();
  const confirmed=bookings.filter(b=>!isCancelled(b));
  $("#booking-count").textContent=bookings.length+" booking"+(bookings.length===1?"":"s")+(confirmed.length!==bookings.length?" · "+confirmed.length+" active":"");
  let title="All bookings";
  if(filterMode==="next") title=session===null?"No upcoming sessions":("Next session · "+formatDateTime(new Date(session)));
  if(filterMode==="today") title="Today · "+shortDate(new Date());
  if(filterMode==="tomorrow"){const d=new Date();d.setDate(d.getDate()+1);title="Tomorrow · "+shortDate(d)}
  if(filterMode==="date"&&filterDate) title="Selected date · "+shortDate(filterDate+"T12:00:00");
  $("#selection-title").textContent=" · "+title;
  $("#bookings").innerHTML=bookings.map(bookingCard).join("")||"<p>No bookings match this view.</p>";
  $$(".filter-buttons button").forEach(btn=>btn.classList.toggle("active",btn.dataset.filter===filterMode));
  $$("[data-toggle-booking]").forEach(btn=>btn.onclick=()=>{const panel=$("#details-"+btn.dataset.toggleBooking);const opening=panel.classList.contains("hidden");panel.classList.toggle("hidden",!opening);btn.setAttribute("aria-expanded",String(opening));btn.textContent=opening?"Hide booking details −":"View booking details ＋"});
  $$("[data-show-qr]").forEach(btn=>btn.onclick=()=>showFamilyQr(btn.dataset.showQr));
  $$("[data-group-select]").forEach(input=>input.onchange=()=>updateBookingField(input.dataset.groupSelect,"group_print_selected",input.checked));
  $$("[data-checkin]").forEach(input=>input.onchange=()=>updateBookingField(input.dataset.checkin,"checked_in_at",input.checked?new Date().toISOString():null));
  $$("[data-upload-photo]").forEach(btn=>btn.onclick=()=>{const input=$('[data-photo-input="'+btn.dataset.uploadPhoto+'"]');if(input)input.click()});
  $$("[data-photo-input]").forEach(input=>input.onchange=()=>{const file=input.files&&input.files[0];if(file)uploadChildPhoto(input.dataset.photoInput,file)});
  $$("[data-remove-photo]").forEach(btn=>btn.onclick=()=>removeChildPhoto(btn.dataset.removePhoto));
  const selected=allBookings.filter(b=>b.group_print_selected&&!isCancelled(b)&&isGroupBooking(b));
  $("#group-selection-count").textContent=selected.length+" selected";
  document.title="Hexham Santa — "+title;
}
async function updateBookingField(id,field,value){
  const patch={};patch[field]=value;
  const {error}=await sb.from("santa_bookings").update(patch).eq("id",id);
  if(error){alert("Couldn't save this change: "+error.message);return load()}
  const booking=allBookings.find(b=>b.id===id);if(booking)booking[field]=value;
  render();
}
async function selectAllGroupBookings(){
  const visible=currentVisibleBookings();
  const candidates=visible.filter(b=>isGroupBooking(b)&&!isCancelled(b));
  if(!candidates.length){alert("There are no group bookings in this view. Choose a date or booking view first.");return}
  const ids=candidates.map(b=>b.id);
  const {error}=await sb.from("santa_bookings").update({group_print_selected:true}).in("id",ids);
  if(error){alert("Couldn't select group bookings: "+error.message);return}
  candidates.forEach(b=>b.group_print_selected=true);
  render();
}
async function clearGroupSelection(){
  const selected=allBookings.filter(b=>b.group_print_selected);
  if(!selected.length)return;
  const {error}=await sb.from("santa_bookings").update({group_print_selected:false}).in("id",selected.map(b=>b.id));
  if(error){alert("Couldn't clear selection: "+error.message);return}
  selected.forEach(b=>b.group_print_selected=false);
  render();
}
function printSelectedGroup(){
  const selected=allBookings.filter(b=>b.group_print_selected&&!isCancelled(b)&&isGroupBooking(b)).sort((a,b)=>new Date(a.visit_starts_at)-new Date(b.visit_starts_at));
  if(!selected.length){alert("Select one or more group bookings first.");return}
  const children=selected.flatMap(b=>(b.santa_children||[]).map(c=>({booking:b,child:c})));
  const childHtml=children.map(({booking:b,child:c})=>{
    const photo=c.photo_url?'<img src="'+esc(c.photo_url)+'" alt="Photo of '+esc(c.preferred_name||"child")+'">':'<div class="print-photo-empty">No photo</div>';
    return '<div class="print-child">'+photo+'<div><h3>'+esc(c.preferred_name||"Unnamed child")+(c.age!=null?' · Age '+esc(c.age):"")+'</h3><div class="print-meta">Family: '+esc(((b.parent_first_name||"")+" "+(b.parent_last_name||"")).trim()||"Not provided")+' · Booking '+esc(formatDateTime(b.visit_starts_at))+'</div><div class="print-notes"><strong>Loves:</strong> '+esc(c.interests||"Not provided")+'</div><div class="print-notes"><strong>Santa should mention:</strong> '+esc(c.santa_notes||"Nothing noted")+'</div></div></div>';
  }).join("");
  $("#group-print-sheet").innerHTML='<p style="letter-spacing:.12em;font-size:9pt">HEXHAM SANTA EXPERIENCE · PRIVATE STAFF BRIEFING</p><h1>Group Visit Briefing</h1><p>'+esc(selected.length)+' bookings · '+esc(children.length)+' children · Prepared '+esc(new Date().toLocaleString("en-GB"))+'</p><hr><h2>Children meeting Santa</h2>'+childHtml+'<hr><p class="print-meta">Confidential operational information. Please keep this sheet with authorised event staff and dispose of it securely after use.</p>';
  $("#group-print-sheet").setAttribute("aria-hidden","false");
  document.body.classList.add("printing-group");
  window.print();
  setTimeout(()=>{document.body.classList.remove("printing-group");$("#group-print-sheet").setAttribute("aria-hidden","true")},500);
}
async function uploadChildPhoto(childId,file){
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){alert("Please choose a JPG, PNG or WebP image.");return}
  if(file.size>5*1024*1024){alert("Please choose an image smaller than 5 MB.");return}
  const child=allBookings.flatMap(b=>b.santa_children||[]).find(c=>c.id===childId);
  if(!child)return alert("Child record not found. Refresh and try again.");
  const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,"-").slice(-80)||"photo";
  const path=childId+"/"+Date.now()+"-"+safeName;
  const {error:uploadError}=await sb.storage.from("santa-child-photos").upload(path,file,{upsert:false,contentType:file.type});
  if(uploadError){alert("Photo upload failed: "+uploadError.message);return}
  const {error:updateError}=await sb.from("santa_children").update({photo_path:path}).eq("id",childId);
  if(updateError){await sb.storage.from("santa-child-photos").remove([path]);alert("Photo uploaded but could not be linked: "+updateError.message);return}
  if(child.photo_path)await sb.storage.from("santa-child-photos").remove([child.photo_path]);
  await load();
}
async function removeChildPhoto(childId){
  if(!confirm("Remove this child's photo?"))return;
  const child=allBookings.flatMap(b=>b.santa_children||[]).find(c=>c.id===childId);
  if(!child||!child.photo_path)return;
  const {error:updateError}=await sb.from("santa_children").update({photo_path:null}).eq("id",childId);
  if(updateError){alert("Couldn't remove the photo: "+updateError.message);return}
  const {error:removeError}=await sb.storage.from("santa-child-photos").remove([child.photo_path]);
  if(removeError)console.warn("Photo path cleared but storage cleanup failed",removeError.message);
  await load();
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
 for(const booking of allBookings){
   for(const child of (booking.santa_children||[])){
     child.photo_url=null;
     if(child.photo_path){
       const {data:signed}=await sb.storage.from("santa-child-photos").createSignedUrl(child.photo_path,3600);
       if(signed?.signedUrl)child.photo_url=signed.signedUrl;
     }
   }
 }
 render();
}
$$(".filter-buttons button").forEach(btn=>btn.onclick=()=>{filterMode=btn.dataset.filter;filterDate=null;$("#date-filter").value="";render()});
$("#date-filter").onchange=()=>{filterDate=$("#date-filter").value;filterMode=filterDate?"date":"all";render()};
$("#print").onclick=()=>window.print();
$("#select-all-groups").onclick=selectAllGroupBookings;
$("#clear-group-selection").onclick=clearGroupSelection;
$("#print-group-briefing").onclick=printSelectedGroup;
window.addEventListener("afterprint",()=>{document.body.classList.remove("printing-group");const sheet=$("#group-print-sheet");if(sheet)sheet.setAttribute("aria-hidden","true")});
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