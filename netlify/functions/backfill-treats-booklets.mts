import crypto from "node:crypto";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
function same(a,b){if(!a||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)}
export default async(req)=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const secret=Netlify.env.get("SANTA_TREATS_PROVISION_SECRET");
 if(!secret||!same(secret,req.headers.get("x-santa-provision-secret")))return json({error:"Unauthorized"},401);
 let body={};try{body=await req.json()}catch{}
 const limit=Math.max(1,Math.min(5,Number.isInteger(body.limit)?body.limit:5));
 const key=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!key)return json({error:"Configuration incomplete"},503);
 const base="https://atqhqizzfnsokulmupmy.supabase.co/rest/v1/";
 async function db(path,opts={}){const r=await fetch(base+path,{...opts,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation",...(opts.headers||{})}});const t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d=t}if(!r.ok)throw Error("database request failed");return d}
 try{
  const rows=await db("santa_bookings?select=id,parent_last_name,treat_booklet_id&status=eq.confirmed&or=(treat_booklet_id.is.null,treat_booklet_id.eq.)&order=created_at.asc&limit="+limit);
  const results=[];
  for(const b of rows||[]){try{
   const r=await fetch("https://giftlocal.netlify.app/api/provision-treats-booklet",{method:"POST",headers:{"content-type":"application/json","x-santa-provision-secret":secret},body:JSON.stringify({booking_ref:b.id,family_surname:b.parent_last_name||""})});
   let d={};try{d=await r.json()}catch{}
   if(!r.ok||!d.access_token){results.push({booking_id:b.id,ok:false});continue}
   await db("santa_bookings?id=eq."+encodeURIComponent(b.id),{method:"PATCH",body:JSON.stringify({treat_booklet_id:d.access_token,updated_at:new Date().toISOString()})});results.push({booking_id:b.id,ok:true});
  }catch{results.push({booking_id:b.id,ok:false})}}
  return json({ok:true,processed:results.length,succeeded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results});
 }catch{return json({error:"Could not read bookings"},500)}
};
export const config={path:"/api/backfill-treats-booklets"};
