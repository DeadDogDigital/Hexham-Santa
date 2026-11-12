const SUPABASE_URL = "https://atqhqizzfnsokulmupmy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-TvnUkpHRB9jkkNqJQAXCA_tkaAeY7_";
const json = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
async function db(path,options={}) {
 const key=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!key)throw new Error("Santa database configuration is incomplete.");
 const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation",...(options.headers||{})}});
 const t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d=t}if(!r.ok)throw new Error(d?.message||"Database request failed.");return d;
}
async function admin(req){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return null;
 const r=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+token}});
 if(!r.ok)return null;const u=await r.json();
 const a=await db("santa_admins?select=user_id&user_id=eq."+encodeURIComponent(u.id)+"&limit=1");return a.length?u:null;
}
async function tt(path){
 const key=Netlify.env.get("TICKET_TAILOR_API_KEY");if(!key)throw new Error("Ticket Tailor API key is not configured.");
 const r=await fetch("https://api.tickettailor.com/v1"+path,{headers:{Authorization:"Basic "+Buffer.from(key+":").toString("base64"),Accept:"application/json"}});
 const t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d={}}if(!r.ok)throw new Error(d?.message||"Ticket Tailor lookup failed.");return d;
}
async function provision(bookingId,surname){
 const secret=Netlify.env.get("SANTA_TREATS_PROVISION_SECRET");if(!secret)throw new Error("Santa Treats provisioning secret is not configured.");
 const r=await fetch("https://giftlocal.netlify.app/api/provision-treats-booklet",{method:"POST",headers:{"content-type":"application/json","x-santa-provision-secret":secret},body:JSON.stringify({booking_ref:bookingId,family_surname:surname||""})});
 const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error||"Treats booklet provisioning failed.");
 await db("santa_bookings?id=eq."+encodeURIComponent(bookingId),{method:"PATCH",body:JSON.stringify({treat_booklet_id:d.access_token,provisioning_status:"complete",provisioning_error:null,updated_at:new Date().toISOString()})});
}
export default async req=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const user=await admin(req);if(!user)return json({error:"Not authorised."},401);
  const body=await req.json();const id=String(body.attempt_id||"");
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Invalid attempt reference."},400);
  const rows=await db("santa_box_office_attempts?select=*&idempotency_key=eq."+encodeURIComponent(id)+"&limit=1");
  if(!rows.length)return json({error:"Booking attempt not found."},404);
  const a=rows[0];if(a.status==="complete"&&a.booking_id)return json({ok:true,complete:true,booking_id:a.booking_id});
  const p=a.request_payload, expected=p.children.map((c,i)=>"santa-box-office:"+id+":"+(i+1));
  const found=new Map((a.issued_tickets||[]).filter(t=>t.reference).map(t=>[t.reference,t]));
  let cursor=null, pages=0;
  while(found.size<expected.length&&pages<100){
   const page=await tt("/issued_tickets?limit=100"+(cursor?"&starting_after="+encodeURIComponent(cursor):""));
   const tickets=page.data||[];
   for(const t of tickets){if(expected.includes(t.reference)&&t.status!=="voided")found.set(t.reference,{id:t.id,barcode:t.barcode||null,qr_code_url:t.qr_code_url||t.barcode_url||null,reference:t.reference,child_name:t.full_name||""});}
   pages++;if(tickets.length<100||page.has_more===false)break;cursor=tickets[tickets.length-1]?.id;if(!cursor)break;
  }
  const issued=expected.map(ref=>found.get(ref)).filter(Boolean);
  await db("santa_box_office_attempts?idempotency_key=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({issued_tickets:issued,status:"recovery_required",error_message:"Reconciled "+issued.length+" of "+expected.length+" Ticket Tailor tickets. No new tickets were issued during recovery.",updated_at:new Date().toISOString()})});
  if(issued.length!==expected.length)return json({ok:false,recovery_required:true,found:issued.length,expected:expected.length,issued_tickets:issued,message:"Ticket Tailor currently shows only "+issued.length+" of "+expected.length+" tickets. No further tickets have been issued. This attempt remains locked for manual review."},202);

  let bookingId=a.booking_id;
  if(!bookingId){
   const existing=await db("santa_bookings?select=id&box_office_reference=eq."+encodeURIComponent(id)+"&limit=1");
   if(existing.length)bookingId=existing[0].id;
   else{
    const parent=p.parent;
    const row=(await db("santa_bookings",{method:"POST",body:JSON.stringify({
     ticket_tailor_order_id:null,ticket_tailor_event_id:p.event_id,ticket_tailor_order_status:"issued",event_name:p.event_name,
     visit_starts_at:p.visit_starts_at,visit_ends_at:p.visit_ends_at,parent_first_name:parent.first_name,parent_last_name:parent.last_name,
     parent_email:parent.email,parent_phone:parent.phone,status:"confirmed",booking_source:"in_person",payment_method:p.payment_method,
     payment_status:"paid",box_office_reference:id,provisioning_status:"tickets_issued",ticket_tailor_issued_ticket_ids:issued.map(t=>t.id)
    })}))[0];bookingId=row.id;
   }
   const childRows=await db("santa_children?select=id&booking_id=eq."+encodeURIComponent(bookingId));
   if(!childRows.length)await db("santa_children",{method:"POST",body:JSON.stringify(p.children.map((c,i)=>({booking_id:bookingId,ticket_tailor_ticket_id:issued[i].id,preferred_name:c.preferred_name,age:c.age,interests:c.interests||null,santa_notes:c.santa_notes||null})))});
   await db("santa_box_office_attempts?idempotency_key=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({booking_id:bookingId,status:"booklet_pending",issued_tickets:issued,updated_at:new Date().toISOString()})});
  }
  try{await provision(bookingId,p.parent.last_name)}catch(e){
   await db("santa_bookings?id=eq."+encodeURIComponent(bookingId),{method:"PATCH",body:JSON.stringify({provisioning_status:"recovery_required",provisioning_error:e.message,updated_at:new Date().toISOString()})});
   await db("santa_box_office_attempts?idempotency_key=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:"recovery_required",error_message:e.message,booking_id:bookingId,updated_at:new Date().toISOString()})});
   return json({ok:false,recovery_required:true,booking_id:bookingId,message:"Tickets and booking are saved, but booklet provisioning still needs attention."},202);
  }
  await db("santa_box_office_attempts?idempotency_key=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:"complete",booking_id:bookingId,issued_tickets:issued,error_message:null,updated_at:new Date().toISOString()})});
  return json({ok:true,complete:true,booking_id:bookingId,issued_tickets:issued});
 }catch(e){return json({error:e.message||"Recovery failed."},500)}
};
export const config={path:"/api/recover-box-office-attempt"};
