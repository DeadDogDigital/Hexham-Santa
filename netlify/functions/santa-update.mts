const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const url="https://atqhqizzfnsokulmupmy.supabase.co";
const clean=v=>String(v??"").trim();
async function db(path,options={}){
  const key=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key)throw new Error("Santa update service is not configured.");
  const res=await fetch(url+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation",...(options.headers||{})}});
  const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text}
  if(!res.ok)throw new Error(typeof data==="string"?data:(data.message||"Database request failed"));
  return data;
}
function tooLate(start){return !start||new Date(start).getTime()<=Date.now()+36*60*60*1000}
async function findBooking(email,reference){
  const rows=await db("santa_bookings?select=id,ticket_tailor_order_id,parent_email,visit_starts_at,status&ticket_tailor_order_id=eq."+encodeURIComponent(reference)+"&limit=1");
  if(!rows.length||clean(rows[0].parent_email).toLowerCase()!==clean(email).toLowerCase())return null;
  return rows[0];
}
export default async req=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  let body;try{body=await req.json()}catch{return json({error:"Invalid request"},400)}
  const email=clean(body.email),reference=clean(body.reference);
  if(!email||!reference)return json({error:"Please provide your booking email and order number."},400);
  const booking=await findBooking(email,reference);
  if(!booking)return json({error:"We couldn't find a booking matching those details."},404);
  if(String(booking.status||"").toLowerCase()==="cancelled")return json({error:"This booking has been cancelled."},400);
  if(body.action==="lookup"){
    const children=await db("santa_children?select=id,preferred_name,age,interests,santa_notes&booking_id=eq."+encodeURIComponent(booking.id)+"&order=created_at.asc");
    return json({locked:tooLate(booking.visit_starts_at),booking:{visit_starts_at:booking.visit_starts_at,children}});
  }
  if(body.action==="update"){
    if(tooLate(booking.visit_starts_at))return json({error:"Updates are closed because your visit is within 36 hours."},403);
    if(!Array.isArray(body.updates)||body.updates.length>20)return json({error:"Invalid update request."},400);
    const children=await db("santa_children?select=id&booking_id=eq."+encodeURIComponent(booking.id));
    const allowed=new Set(children.map(c=>c.id));
    for(const item of body.updates){
      if(!allowed.has(item.id))return json({error:"Invalid child selection."},400);
      const interests=clean(item.interests),notes=clean(item.santa_notes);
      if(interests.length>1000||notes.length>1000)return json({error:"One of the fields is too long."},400);
      await db("santa_children?id=eq."+encodeURIComponent(item.id)+"&booking_id=eq."+encodeURIComponent(booking.id),{method:"PATCH",body:JSON.stringify({interests:interests||null,santa_notes:notes||null,updated_at:new Date().toISOString()})});
    }
    return json({ok:true});
  }
  return json({error:"Invalid action."},400);
};
export const config={path:"/api/santa-update"};