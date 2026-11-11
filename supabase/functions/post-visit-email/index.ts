import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"https://hexhamsanta.co.uk","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const validEmail=(s:string|null)=>!!s&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const family=(b:any)=>[b.parent_first_name,b.parent_last_name].filter(Boolean).join(" ").trim();
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const eligible=(b:any,books:any[])=>String(b.status||"").toLowerCase()==="confirmed"&&!!b.checked_in_at&&validEmail(b.parent_email)&&!!b.visit_starts_at&&today()===new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(b.visit_starts_at))&&books.length>0;
const cleanBooks=(b:any,extra:any[])=>[{label:"Your family booklet",token:b.treat_booklet_id},...extra.map((x:any,i:number)=>({label:String(x.label||("Additional booklet "+(i+1))),token:x.treat_booklet_id}))].filter(x=>typeof x.token==="string"&&x.token.trim()).map(x=>({label:x.label,token:x.token.trim()}));
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(!["GET","POST"].includes(req.method))return json({error:"Method not allowed"},405);
 try{
  const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return json({error:"Sign-in required"},401);
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")||JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:u,error:ue}=await userClient.auth.getUser(auth.slice(7));if(ue||!u.user)return json({error:"Session expired"},401);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:adm}=await admin.from("santa_admins").select("user_id").eq("user_id",u.user.id).maybeSingle();if(!adm)return json({error:"Not authorised"},403);
  const load=async(id?:string)=>{
   let q=admin.from("santa_bookings").select("id,status,parent_first_name,parent_last_name,parent_email,visit_starts_at,checked_in_at,treat_booklet_id").order("visit_starts_at");
   if(id)q=q.eq("id",id);
   const {data,error}=await q;if(error)throw error;
   const ids=(data||[]).map((x:any)=>x.id);let extras:any[]=[];
   if(ids.length){const {data:d,error:e}=await admin.from("santa_booking_extra_treats_booklets").select("id,booking_id,treat_booklet_id,label").in("booking_id",ids);if(e)throw e;extras=d||[];}
   return (data||[]).map((b:any)=>{const books=cleanBooks(b,extras.filter((x:any)=>x.booking_id===b.id));return {...b,booklets:books,eligible:eligible(b,books)};});
  };
  const body=req.method==="POST"?await req.json():{};
  if(req.method==="GET"||body.action==="list"){
   const rows=await load();const day=today();const todayRows=rows.filter((b:any)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(b.visit_starts_at))===day);
   const {data:batch}=await admin.from("santa_email_batches").select("id").eq("email_type","post_visit").eq("visit_date",day).eq("lead_days",0).maybeSingle();
   let approvals:any[]=[];let sent:string[]=[];
   if(batch){const {data:a,error:ae}=await admin.from("santa_email_approvals").select("booking_id,approved,child_snapshot").eq("batch_id",batch.id);if(ae)throw ae;approvals=a||[];const {data:s,error:se}=await admin.from("santa_email_send_log").select("booking_id").eq("batch_id",batch.id).eq("status","sent");if(se)throw se;sent=(s||[]).map((x:any)=>x.booking_id);}
   return json({date:day,bookings:todayRows.map((b:any)=>({...b,approved:!!approvals.find((a:any)=>a.booking_id===b.id&&a.approved),sent:sent.includes(b.id)}))});
  }
  if(body.action==="approve"){
   const id=String(body.bookingId||"");const rows=await load(id);const b=rows[0];if(!b)return json({error:"Booking not found"},404);
   if(!b.eligible)return json({error:"Only checked-in families with a valid email and booklet link can be approved."},409);
   const day=today();if(body.visitDate!==day)return json({error:"Refresh the list. The visit date has changed."},409);
   const {data:batch,error:be}=await admin.from("santa_email_batches").upsert({email_type:"post_visit",visit_date:day,lead_days:0,status:"review",updated_at:new Date().toISOString()},{onConflict:"email_type,visit_date,lead_days"}).select("id").single();if(be)throw be;
   const snapshot={booklets:b.booklets};
   const {error:e}=await admin.from("santa_email_approvals").upsert({batch_id:batch.id,booking_id:b.id,recipient_email:b.parent_email.trim(),recipient_name:family(b),visit_starts_at:b.visit_starts_at,child_snapshot:snapshot,approved:body.approved===true,approved_by:body.approved===true?u.user.id:null,approved_at:body.approved===true?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:"batch_id,booking_id"});if(e)throw e;
   return json({ok:true,approved:body.approved===true});
  }
  if(body.action==="reset"){
   const day=today();const {data:batch}=await admin.from("santa_email_batches").select("id").eq("email_type","post_visit").eq("visit_date",day).eq("lead_days",0).maybeSingle();if(!batch)return json({ok:true,reset:0});
   const {data:rows,error}=await admin.from("santa_email_approvals").select("id").eq("batch_id",batch.id).eq("approved",true);if(error)throw error;
   const ids=(rows||[]).map((x:any)=>x.id);if(ids.length){const {error:e}=await admin.from("santa_email_approvals").update({approved:false,approved_by:null,approved_at:null,updated_at:new Date().toISOString()}).in("id",ids);if(e)throw e;}
   return json({ok:true,reset:ids.length});
  }
  if(body.action==="send"){
   if(body.confirm!==true||body.finalConfirm!==true)return json({error:"Two explicit confirmations are required."},400);
   const day=today();const {data:batch,error:be}=await admin.from("santa_email_batches").select("id,status").eq("email_type","post_visit").eq("visit_date",day).eq("lead_days",0).maybeSingle();if(be)throw be;if(!batch)return json({error:"No post-visit approvals exist for today."},404);
   const {data:rows,error:re}=await admin.from("santa_email_approvals").select("id,booking_id,recipient_email,recipient_name,visit_starts_at,child_snapshot").eq("batch_id",batch.id).eq("approved",true);if(re)throw re;if(!rows?.length)return json({error:"No approved emails."},409);if(rows.length>25)return json({error:"Send no more than 25 emails in one batch."},409);
   const counts=new Map<string,number>();rows.forEach((r:any)=>{const k=r.recipient_email.trim().toLowerCase();counts.set(k,(counts.get(k)||0)+1)});if([...counts.values()].some(n=>n>1))return json({error:"Duplicate recipient addresses must be resolved before sending."},409);
   const key=Deno.env.get("RESEND_API_KEY");if(!key)return json({error:"Email delivery is not configured."},503);
   const outcomes=[];
   for(const a of rows){
    const loaded=await load(a.booking_id),b=loaded[0];const same=b&&b.eligible&&b.parent_email.trim().toLowerCase()===a.recipient_email.trim().toLowerCase()&&family(b)===(a.recipient_name||"")&&new Date(b.visit_starts_at).getTime()===new Date(a.visit_starts_at).getTime()&&JSON.stringify(b.booklets)===JSON.stringify(a.child_snapshot?.booklets||[]);
    if(!same){await admin.from("santa_email_approvals").update({approved:false,approved_by:null,approved_at:null,updated_at:new Date().toISOString()}).eq("id",a.id);outcomes.push({booking_id:a.booking_id,status:"skipped",reason:"Attendance, contact or booklet details changed."});continue;}
    const idempotencyKey="hexham-postvisit-"+batch.id+"-"+b.id;
    const {data:claim,error:ce}=await admin.from("santa_email_send_log").insert({batch_id:batch.id,booking_id:b.id,email_type:"post_visit",recipient_email:b.parent_email.trim(),provider:"resend",status:"sending",attempt_number:1,idempotency_key:idempotencyKey,initiated_by:u.user.id,started_at:new Date().toISOString(),response_metadata:{}}).select("id").maybeSingle();
    if(ce||!claim){outcomes.push({booking_id:b.id,status:"skipped",reason:"A send record already exists."});continue;}
    const links=b.booklets.map((x:any)=>'<p><a href="https://giftlocal.netlify.app/treats/'+encodeURIComponent(x.token)+'">'+String(x.label).replace(/[&<>"]/g,"")+'</a></p>').join("");
    const first=String(b.parent_first_name||"there").replace(/[&<>"]/g,"");
    const subject="Thank you for visiting Santa in Hexham";
    const html='<div style="max-width:620px;margin:24px auto;background:#fffdf7;color:#30291f;font:16px/1.65 Arial,sans-serif;border:1px solid #e6dcc8;border-radius:14px;overflow:hidden"><div style="background:#142820;color:#fff8e9;padding:24px 28px"><div style="font-size:11px;letter-spacing:3px;color:#d8bd75">HEXHAM CHRISTMAS</div><h1 style="font:normal 28px Georgia,serif">Thank you for visiting!</h1></div><div style="padding:26px 28px"><p>Hello '+first+',</p><p>Thank you for joining us at the Hexham Santa Experience. We hope you and your family enjoyed your visit.</p><p>Your Santa’s Local Treats booklet'+(b.booklets.length===1?" is":"s are")+' ready. Use the link'+(b.booklets.length===1?"":"s")+' below to explore the offers and treats available from participating local businesses.</p>'+links+'<p>Thank you for supporting Hexham Christmas and the local businesses taking part. We hope to see you again.</p><p>The Hexham Christmas Team<br>Santa in Hexham</p></div></div>';
    const textBody="Hello "+(b.parent_first_name||"there")+",\n\nThank you for joining us at the Hexham Santa Experience. We hope you and your family enjoyed your visit.\n\nYour Santa’s Local Treats booklet links:\n"+b.booklets.map((x:any)=>x.label+": https://giftlocal.netlify.app/treats/"+encodeURIComponent(x.token)).join("\n")+"\n\nThank you for supporting Hexham Christmas and the local businesses taking part. We hope to see you again.\n\nThe Hexham Christmas Team";
    try{const resp=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":idempotencyKey},body:JSON.stringify({from:"Santa in Hexham <santa@updates.hexhamsanta.co.uk>",to:[b.parent_email.trim()],reply_to:"hexhamchristmas@gmail.com",subject,html,text:textBody})});const result=await resp.json().catch(()=>({}));if(!resp.ok||!result.id){await admin.from("santa_email_send_log").update({status:"failed",failed_at:new Date().toISOString(),error_code:String(result.name||resp.status),error_message:String(result.message||"Resend rejected the message").slice(0,500),response_metadata:{http_status:resp.status}}).eq("id",claim.id);outcomes.push({booking_id:b.id,status:"failed"});}else{await admin.from("santa_email_send_log").update({status:"sent",provider_message_id:result.id,sent_at:new Date().toISOString(),response_metadata:{accepted:true}}).eq("id",claim.id);outcomes.push({booking_id:b.id,status:"sent"});}}catch(e){await admin.from("santa_email_send_log").update({status:"failed",failed_at:new Date().toISOString(),error_code:"provider_request_error",error_message:String(e).slice(0,500)}).eq("id",claim.id);outcomes.push({booking_id:b.id,status:"failed"});}
   }
   return json({ok:true,sent:outcomes.filter(x=>x.status==="sent").length,failed:outcomes.filter(x=>x.status==="failed").length,skipped:outcomes.filter(x=>x.status==="skipped").length,outcomes});
  }
  return json({error:"Unknown action"},400);
 }catch(e){console.error("post-visit-email",e);return json({error:"The post-visit email request could not be completed."},500);}
});