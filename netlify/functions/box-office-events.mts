import crypto from "node:crypto";

const SUPABASE_URL = "https://atqhqizzfnsokulmupmy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-TvnUkpHRB9jkkNqJQAXCA_tkaAeY7_";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = value => typeof value === "string" ? value.trim() : "";

async function db(path, options = {}) {
  const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Santa database configuration is incomplete.");
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...options,
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation", ...(options.headers || {}) }
  });
  const body = await response.text();
  let data; try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) throw new Error(data?.message || "Database request failed.");
  return data;
}

async function requireAdmin(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");
  if (!token) return null;
  const auth = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token } });
  if (!auth.ok) return null;
  const user = await auth.json();
  const admins = await db("santa_admins?select=user_id&user_id=eq." + encodeURIComponent(user.id) + "&limit=1");
  return admins?.length ? user : null;
}

async function ticketTailor(path, options = {}) {
  const key = Netlify.env.get("TICKET_TAILOR_API_KEY");
  if (!key) throw new Error("Ticket Tailor API key is not configured.");
  const response = await fetch("https://api.tickettailor.com/v1" + path, {
    ...options,
    headers: { Authorization: "Basic " + Buffer.from(key + ":").toString("base64"), ...(options.headers || {}) }
  });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!response.ok) throw new Error(data?.error || data?.message || "Ticket Tailor request failed (" + response.status + ").");
  return data;
}

async function events() {
  const all = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const result = await ticketTailor("/events?limit=100&status=published" + (cursor ? "&starting_after=" + encodeURIComponent(cursor) : ""));
    const batch = result?.data || [];
    all.push(...batch);
    if (batch.length < 100 || !result?.links?.next) break;
    cursor = batch[batch.length - 1]?.id;
    if (!cursor) break;
  }
  return all.map(event => ({
    id: event.id,
    event_series_id: event.event_series_id,
    name: event.name,
    start: event.start?.iso || event.start?.date || null,
    end: event.end?.iso || event.end?.date || null,
    timezone: event.timezone || "Europe/London",
    unavailable: event.unavailable === "true" || event.tickets_available === "false",
    ticket_types: (event.ticket_types || []).map(ticket => ({
      id: ticket.id, name: ticket.name, price: ticket.price, currency: event.currency || "gbp",
      status: ticket.status, quantity: ticket.quantity, quantity_held: ticket.quantity_held,
      quantity_issued: ticket.quantity_issued,
      remaining: Math.max(0, Number(ticket.quantity_total ?? (Number(ticket.quantity || 0) + Number(ticket.quantity_issued || 0))) - Number(ticket.quantity_issued || 0) - Number(ticket.quantity_held || 0) - Number(ticket.quantity_in_baskets || 0))
    })).filter(ticket => ["on_sale", "admin_only"].includes(ticket.status))
  }));
}

export default async request => {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const user = await requireAdmin(request);
    if (!user) return json({ error: "You are not authorised to use the box office." }, 401);
    return json({ events: await events() });
  } catch (error) {
    return json({ error: error.message || "Could not load Ticket Tailor events." }, 502);
  }
};
export const config = { path: "/api/box-office-events" };
