import crypto from "node:crypto";

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

function validSignature(raw,header,secret){
  if(!header||!secret)return false;
  const parts=Object.fromEntries(header.split(",").map(p=>p.trim().split("=")));
  const ts=parts.t;
  const sig=parts.v1;
  if(!ts||!sig)return false;
  const age=Math.abs(Date.now()/1000-Number(ts));
  if(!Number.isFinite(age)||age>300)return false;
  const expected=crypto.createHmac("sha256",secret).update(ts+raw).digest("hex");
  if(expected.length!==sig.length)return false;
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(sig));
}

async function db(path,options={}){
  const url=Netlify.env.get("SUPABASE_URL");
  const key=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)throw new Error("Santa Supabase server configuration is incomplete.");
  const res=await fetch(url+"/rest/v1/"+path,{
    ...options,
    headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation",...(options.headers||{})}
  });
  const text=await res.text();
  let data;try{data=JSON.parse(text)}catch{data=text}
  if(!res.ok)throw new Error(typeof data==="string"?data:(data.message||data.hint||"Supabase request failed"));
  return data;
}

const text=v=>v==null?null:String(v).trim()||null;

function questions(order){
  const all=[];
  if(order.buyer_details?.custom_questions)all.push(...order.buyer_details.custom_questions);
  for(const t of order.issued_tickets||[]) if(t.custom_questions) all.push(...t.custom_questions);
  return Object.fromEntries(all.map(q=>[(q.question||"").trim().toLowerCase(),q.answer??""]));
}

function answer(qs,names){
  for(const n of names){const v=qs[n];if(v!=null&&String(v).trim())return text(v)}
  return null;
}

export default async (req)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const raw=await req.text();
  if(!validSignature(raw,req.headers.get("Tickettailor-Webhook-Signature"),Netlify.env.get("TICKET_TAILOR_WEBHOOK_SECRET"))){
    return json({error:"Invalid webhook signature"},401);
  }

  let hook;
  try{hook=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400);}
  if(!hook.id)return json({error:"Missing webhook id"},400);

  const seen=await db("ticket_tailor_webhook_events?select=id,processed_at&webhook_id=eq."+encodeURIComponent(hook.id));
  if(seen.length&&seen[0].processed_at)return json({ok:true,duplicate:true});

  if(!seen.length){
    await db("ticket_tailor_webhook_events",{method:"POST",body:JSON.stringify({webhook_id:hook.id,event:hook.event||"UNKNOWN",resource_url:hook.resource_url||null,payload:hook.payload||{}})});
  }

  const order=hook.payload||{};
  if(!order.id)return json({ok:true,ignored:true});

  const existing=await db("santa_bookings?select=id&ticket_tailor_order_id=eq."+encodeURIComponent(order.id)+"&limit=1");

  if(hook.event==="ORDER.UPDATED" && (order.status||"").toLowerCase()==="cancelled"){
    if(existing.length){
      await db("santa_bookings?id=eq."+encodeURIComponent(existing[0].id),{method:"PATCH",body:JSON.stringify({status:"cancelled",ticket_tailor_order_status:order.status,updated_at:new Date().toISOString()})});
    }
  } else if(hook.event==="ORDER.CREATED"||hook.event==="ORDER.UPDATED"){
    const buyer=order.buyer_details||{};
    const event=order.event_summary||{};
    const booking={
      ticket_tailor_order_id:order.id,
      ticket_tailor_event_id:event.event_id||event.id||null,
      ticket_tailor_order_status:order.status||null,
      event_name:event.name||null,
      visit_starts_at:event.start_date?.iso||event.start_date||null,
      visit_ends_at:event.end_date?.iso||event.end_date||null,
      parent_first_name:buyer.first_name||null,
      parent_last_name:buyer.last_name||null,
      parent_email:buyer.email||null,
      parent_phone:buyer.phone||null,
      status:(order.status||"").toLowerCase()==="cancelled"?"cancelled":"confirmed",
      updated_at:new Date().toISOString()
    };
    let bookingId;
    if(existing.length){
      bookingId=existing[0].id;
      await db("santa_bookings?id=eq."+encodeURIComponent(bookingId),{method:"PATCH",body:JSON.stringify(booking)});
    }else{
      bookingId=(await db("santa_bookings",{method:"POST",body:JSON.stringify(booking)}))[0].id;
    }

    if(hook.event==="ORDER.CREATED"&&!existing.length){
      const qs=questions(order);
      const children=(order.issued_tickets||[]).map(t=>({
        booking_id:bookingId,
        ticket_tailor_ticket_id:t.id||null,
        preferred_name:text(t.first_name||t.name||answer(qs,["child preferred name","child first name"])),
        age:Number.isFinite(Number(answer(qs,["child age","age"])))?Number(answer(qs,["child age","age"])):null,
        interests:answer(qs,["things they love","child interests","interests"]),
        santa_notes:answer(qs,["anything santa should mention","anything santa should know","santa notes"])
      })).filter(c=>c.preferred_name);
      if(children.length)await db("santa_children",{method:"POST",body:JSON.stringify(children)});
    }
  }

  await db("ticket_tailor_webhook_events?webhook_id=eq."+encodeURIComponent(hook.id),{method:"PATCH",body:JSON.stringify({processed_at:new Date().toISOString(),processing_error:null})});
  return json({ok:true});
};

export const config={path:"/api/ticket-tailor-webhook"};