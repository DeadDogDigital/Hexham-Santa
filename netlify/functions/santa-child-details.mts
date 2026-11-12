import crypto from "node:crypto";
const URL="https://atqhqizzfnsokulmupmy.supabase.co";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff"}});
const clean=v=>typeof v==="string"?v.trim():"";
async function db(path,options={}){const key=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!key)throw new Error("Service unavailable.");const r=await fetch(URL+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation",...(options.headers||{})}});const t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d=t}if(!r.ok)throw new Error("Database request failed.");return d}
async function tokenRow(token){if(!/^[A-Za-z0-9_-]{40,100}$/.test(token))return null;const hash=crypto.createHash("sha256").update(token).digest("hex");const rows=await db("santa_booking_update_tokens?select=id,booking_id,expires_at,revoked_at&token_hash=eq."+hash+"&limit=1");const row=rows[0];if(!row||row.revoked_at||new Date(row.expires_at)<=new Date())return null;return row}
export default async req=>{
 if(!["GET","POST"].includes(req.method))return json({error:"Method not allowed"},405);
 try{
  const token=new URLSearchParams(new URL(req.url).search).get("token")||"";
  const row=await tokenRow(token);if(!row)return json({error:"This secure link is invalid or has expired. Please contact the Hexham Christmas team."},403);
  const bookings=await db("santa_bookings?select=id,parent_first_name,visit_starts_at,status,child_info_request_status&id=eq."+encodeURIComponent(row.booking_id)+"&limit=1");
  const booking=bookings[0];if(!booking||booking.status==="cancelled")return json({error:"This booking is no longer available."},404);
  if(new Date(booking.visit_starts_at).getTime()<=Date.now()+36*60*60*1000)return json({error:"The child details form has closed because your visit is within 36 hours."},403);
  if(req.method==="GET"){
   const children=await db("santa_children?select=id,preferred_name,age,interests,santa_notes&booking_id=eq."+encodeURIComponent(booking.id)+"&order=created_at.asc");
   return json({booking:{first_name:booking.parent_first_name,visit_starts_at:booking.visit_starts_at},children});
  }
  const body=await req.json();if(!Array.isArray(body.children)||body.children.length>10)return json({error:"Invalid child details."},400);
  const existing=await db("santa_children?select=id&booking_id=eq."+encodeURIComponent(booking.id));
  const allowed=new Set(existing.map(c=>c.id));if(body.children.length!==existing.length||body.children.some(c=>!allowed.has(c.id)))return json({error:"The child list does not match this booking."},400);
  for(const child of body.children){
   const name=clean(child.preferred_name),age=child.age===""||child.age==null?null:Number(child.age),interests=clean(child.interests),notes=clean(child.santa_notes);
   if(!name||name.length>100|| (age!==null&&(!Number.isInteger(age)||age<0||age>18))||interests.length>1000||notes.length>1000)return json({error:"Please check the name, age and text lengths."},400);
   await db("santa_children?id=eq."+encodeURIComponent(child.id)+"&booking_id=eq."+encodeURIComponent(booking.id),{method:"PATCH",body:JSON.stringify({preferred_name:name,age,interests:interests||null,santa_notes:notes||null,updated_at:new Date().toISOString()})});
  }
  await db("santa_bookings?id=eq."+encodeURIComponent(booking.id),{method:"PATCH",body:JSON.stringify({child_info_request_status:"completed",updated_at:new Date().toISOString()})});
  return json({ok:true});
 }catch(e){return json({error:e.message||"Could not save the details."},500)}
};
export const config={path:"/api/santa-child-details"};
