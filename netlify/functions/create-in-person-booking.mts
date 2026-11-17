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
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || "Database request failed.");
  return data;
}

async function requireAdmin(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const auth = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token } });
  if (!auth.ok) return null;
  const user = await auth.json();
  const admins = await db("santa_admins?select=user_id&user_id=eq." + encodeURIComponent(user.id) + "&limit=1");
  return admins?.length ? user : null;
}

async function tt(path, options = {}) {
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

async function sendChildDetailsEmail(bookingId, visitStartsAt, authorization) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiry = new Date(new Date(visitStartsAt).getTime() - 36 * 60 * 60 * 1000).toISOString();
  await db("santa_booking_update_tokens", {
    method: "POST",
    body: JSON.stringify({ booking_id: bookingId, token_hash: tokenHash, expires_at: expiry })
  });
  const response = await fetch("https://atqhqizzfnsokulmupmy.supabase.co/functions/v1/send-child-info-request", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: authorization || "", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ booking_id: bookingId, token: rawToken })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || "The parent details email could not be sent.");
  return true;
}

async function provisionBooklet(bookingId, surname) {
  const secret = Netlify.env.get("SANTA_TREATS_PROVISION_SECRET");
  if (!secret) throw new Error("Santa Treats provisioning secret is not configured.");
  const response = await fetch("https://giftlocal.netlify.app/api/provision-treats-booklet", {
    method: "POST",
    headers: { "content-type": "application/json", "x-santa-provision-secret": secret },
    body: JSON.stringify({ booking_ref: bookingId, family_surname: surname || "" })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error(result.error || "Santa Treats booklet provisioning failed.");
  await db("santa_bookings?id=eq." + encodeURIComponent(bookingId), {
    method: "PATCH", body: JSON.stringify({ treat_booklet_id: result.access_token, provisioning_status: "complete", provisioning_error: null, updated_at: new Date().toISOString() })
  });
  return result.access_token;
}

function validUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export default async request => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let attemptId = null;
  let attemptCreated = false;
  try {
    const user = await requireAdmin(request);
    if (!user) return json({ error: "You are not authorised to use the box office." }, 401);
    const body = await request.json();
    attemptId = clean(body.idempotency_key);
    if (!validUuid(attemptId)) return json({ error: "A valid booking attempt reference is required." }, 400);

    const eventId = clean(body.event_id), seriesId = clean(body.event_series_id), ticketTypeId = clean(body.ticket_type_id);
    const parent = body.parent || {};
    const children = Array.isArray(body.children) ? body.children : [];
    const detailsMode = body.child_details_mode === "email" ? "email" : "now";
    const first = clean(parent.first_name), last = clean(parent.last_name), email = clean(parent.email), phone = clean(parent.phone);
    const paymentMethod = clean(body.payment_method);
    if (!eventId || !seriesId || !ticketTypeId || !first || !last || !email || !children.length || children.length > 10) return json({ error: "Complete the session, parent details and child details before taking payment." }, 400);
    if (!["cash", "card", "bank_transfer", "other"].includes(paymentMethod)) return json({ error: "Choose a valid payment method." }, 400);
    if (detailsMode === "now" && children.some(c => !clean(c.preferred_name))) return json({ error: "Every child needs a name." }, 400);
    if (children.some(c => c.age !== undefined && c.age !== null && c.age !== "" && (!Number.isInteger(Number(c.age)) || Number(c.age) < 0 || Number(c.age) > 18))) return json({ error: "A child's age must be a whole number between 0 and 18." }, 400);

    const payload = {
      event_id: eventId, event_series_id: seriesId, ticket_type_id: ticketTypeId,
      parent: { first_name: first, last_name: last, email, phone },
      child_details_mode: detailsMode, children: children.map(c => ({ preferred_name: detailsMode === "email" ? (clean(c.preferred_name).slice(0,100) || "Details awaited") : clean(c.preferred_name).slice(0, 100), age: Number.isInteger(Number(c.age)) && c.age !== "" ? Number(c.age) : null, interests: clean(c.interests).slice(0, 1000), santa_notes: clean(c.santa_notes).slice(0, 1000) })),
      payment_method: paymentMethod, event_name: clean(body.event_name), visit_starts_at: body.visit_starts_at || null, visit_ends_at: body.visit_ends_at || null
    };
    if (detailsMode === "email" && (!payload.visit_starts_at || !Number.isFinite(new Date(payload.visit_starts_at).getTime()) || new Date(payload.visit_starts_at).getTime() <= Date.now() + 36 * 60 * 60 * 1000)) {
      return json({ error: "The parent details email must be requested at least 36 hours before the visit. Choose ‘enter details now’ instead." }, 400);
    }

    const existing = await db("santa_box_office_attempts?select=id,status,booking_id,issued_tickets,error_message&idempotency_key=eq." + encodeURIComponent(attemptId) + "&limit=1");
    if (existing.length) {
      const a = existing[0];
      if (a.status === "complete" && a.booking_id) return json({ ok: true, duplicate: true, booking_id: a.booking_id });
      return json({ error: "This booking attempt already exists and needs recovery. No further tickets have been issued.", attempt_id: a.id, status: a.status, issued_tickets: a.issued_tickets }, 409);
    }

    try {
      await db("santa_box_office_attempts", { method: "POST", body: JSON.stringify({ idempotency_key: attemptId, status: "started", request_payload: payload, created_by: user.id }) });
      attemptCreated = true;
    } catch (error) {
      if (/duplicate key|unique constraint|23505/i.test(error.message || "")) {
        return json({ error: "This booking attempt is already being processed. Do not submit it again; use recovery if it does not finish." }, 409);
      }
      throw error;
    }

    // Re-read live inventory immediately before issuing. Ticket Tailor also atomically rejects any over-allocation.
    const occurrence = await tt("/events/" + encodeURIComponent(eventId));
    const nowSeconds = Math.floor(Date.now() / 1000);
    const eventUnavailable =
      occurrence.hidden === true || occurrence.hidden === "true" ||
      occurrence.unavailable === true || occurrence.unavailable === "true" ||
      occurrence.status !== "published" ||
      occurrence.tickets_available === false || occurrence.tickets_available === "false" ||
      (Number(occurrence.tickets_available_at) > 0 && Number(occurrence.tickets_available_at) > nowSeconds) ||
      (Number(occurrence.tickets_unavailable_at) > 0 && Number(occurrence.tickets_unavailable_at) <= nowSeconds);
    if (eventUnavailable) throw new Error("This session is hidden, closed or not currently available in Ticket Tailor.");
    const allocation = (occurrence.ticket_types || []).find(t => t.id === ticketTypeId);
    if (!allocation || allocation.status !== "on_sale") throw new Error("That ticket type is not set to On sale in Ticket Tailor, so it cannot be sold at the Box Office.");
    const total = Number(allocation.quantity_total ?? (Number(allocation.quantity || 0) + Number(allocation.quantity_issued || 0)));
    const remaining = Math.max(0, total - Number(allocation.quantity_issued || 0) - Number(allocation.quantity_held || 0) - Number(allocation.quantity_in_baskets || 0));
    if (remaining < children.length) throw new Error("There are only " + Math.max(0, remaining) + " tickets remaining for that session.");

    await db("santa_box_office_attempts?idempotency_key=eq." + encodeURIComponent(attemptId), { method: "PATCH", body: JSON.stringify({ status: "issuing_tickets", updated_at: new Date().toISOString() }) });

    const issued = [];
    for (let i = 0; i < payload.children.length; i++) {
      const child = payload.children[i];
      const names = child.preferred_name.split(/\s+/);
      const ticketResponse = await tt("/issued_tickets", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          event_id: eventId, ticket_type_id: ticketTypeId, full_name: detailsMode === "email" ? (first + " " + last) : child.preferred_name,
          reference: "santa-box-office:" + attemptId + ":" + (i + 1), send_email: "false"
        })
      });
      const ticket = Array.isArray(ticketResponse?.data) ? ticketResponse.data[0] : ticketResponse?.data || ticketResponse;
      if (!ticket?.id) throw new Error("Ticket Tailor returned an unexpected ticket response. This attempt is held for recovery; do not submit it again.");
      issued.push({ id: ticket.id, barcode: ticket.barcode || null, qr_code_url: ticket.qr_code_url || ticket.barcode_url || null, reference: ticket.reference || ("santa-box-office:" + attemptId + ":" + (i + 1)), child_name: child.preferred_name });
      await db("santa_box_office_attempts?idempotency_key=eq." + encodeURIComponent(attemptId), { method: "PATCH", body: JSON.stringify({ issued_tickets: issued, updated_at: new Date().toISOString() }) });
    }

    const bookingRow = (await db("santa_bookings", {
      method: "POST",
      body: JSON.stringify({
        ticket_tailor_order_id: null, ticket_tailor_event_id: eventId,
        ticket_tailor_order_status: "issued", event_name: payload.event_name,
        visit_starts_at: payload.visit_starts_at, visit_ends_at: payload.visit_ends_at,
        parent_first_name: first, parent_last_name: last, parent_email: email, parent_phone: phone,
        status: "confirmed", booking_source: "in_person", payment_method: paymentMethod, payment_status: "paid",
        box_office_reference: attemptId, provisioning_status: "tickets_issued", child_info_request_status: detailsMode === "email" ? "pending" : "not_requested",
        ticket_tailor_issued_ticket_ids: issued.map(t => t.id)
      })
    }))[0];

    await db("santa_children", {
      method: "POST",
      body: JSON.stringify(payload.children.map((child, i) => ({
        booking_id: bookingRow.id, ticket_tailor_ticket_id: issued[i].id,
        preferred_name: child.preferred_name, age: detailsMode === "email" ? null : child.age, interests: child.interests || null, santa_notes: child.santa_notes || null
      })))
    });

    await db("santa_box_office_attempts?idempotency_key=eq." + encodeURIComponent(attemptId), {
      method: "PATCH", body: JSON.stringify({ status: "booklet_pending", booking_id: bookingRow.id, issued_tickets: issued, updated_at: new Date().toISOString() })
    });

    try {
      await provisionBooklet(bookingRow.id, last);
    } catch (error) {
      await db("santa_bookings?id=eq." + encodeURIComponent(bookingRow.id), { method: "PATCH", body: JSON.stringify({ provisioning_status: "recovery_required", provisioning_error: error.message, updated_at: new Date().toISOString() }) });
      await db("santa_box_office_attempts?idempotency_key=eq." + encodeURIComponent(attemptId), { method: "PATCH", body: JSON.stringify({ status: "recovery_required", error_message: error.message, updated_at: new Date().toISOString() }) });
      return json({ ok: false, recovery_required: true, booking_id: bookingRow.id, message: "Tickets were issued and the booking was saved, but the Treats booklet needs recovery. Do not sell these tickets again." }, 202);
    }

    if (detailsMode === "email") {
      try {
        await sendChildDetailsEmail(bookingRow.id, payload.visit_starts_at, request.headers.get("authorization") || "");
      } catch (error) {
        const message = error.message || "The parent details email could not be sent.";
        await db("santa_bookings?id=eq." + encodeURIComponent(bookingRow.id), {
          method: "PATCH", body: JSON.stringify({ child_info_request_status: "failed", updated_at: new Date().toISOString() })
        });
        await db("santa_box_office_attempts?idempotency_key=eq." + encodeURIComponent(attemptId), {
          method: "PATCH", body: JSON.stringify({ status: "recovery_required", booking_id: bookingRow.id, error_message: message, updated_at: new Date().toISOString() })
        });
        return json({ ok: false, recovery_required: true, email_failed: true, booking_id: bookingRow.id, message: "The tickets and booking are saved, but the parent details email was not sent. Use recovery to retry it. Do not create this booking again." }, 202);
      }
    }

    await db("santa_box_office_attempts?idempotency_key=eq." + encodeURIComponent(attemptId), { method: "PATCH", body: JSON.stringify({ status: "complete", booking_id: bookingRow.id, issued_tickets: issued, error_message: null, updated_at: new Date().toISOString() }) });
    return json({ ok: true, booking_id: bookingRow.id, issued_tickets: issued, child_details_email: detailsMode === "email" });
  } catch (error) {
    if (attemptCreated && attemptId && validUuid(attemptId)) {
      try { await db("santa_box_office_attempts?idempotency_key=eq." + encodeURIComponent(attemptId), { method: "PATCH", body: JSON.stringify({ status: "recovery_required", error_message: error.message || "Unknown failure", updated_at: new Date().toISOString() }) }); } catch {}
    }
    return json({ error: error.message || "Could not complete the in-person booking.", attempt_id: attemptId }, 500);
  }
};
export const config = { path: "/api/create-in-person-booking" };
