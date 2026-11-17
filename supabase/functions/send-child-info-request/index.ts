import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://hexhamsanta.co.uk",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const validEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Sign-in required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !resendKey) {
      return json({ error: "Email service is not configured." }, 503);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !userData.user) return json({ error: "Your session is not valid." }, 401);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: adminRow } = await admin.from("santa_admins")
      .select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (!adminRow) return json({ error: "Not authorised." }, 403);

    const body = await request.json();
    const bookingId = String(body.booking_id || "");
    const token = String(body.token || "");
    if (!/^[0-9a-f-]{36}$/i.test(bookingId) || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
      return json({ error: "Invalid request." }, 400);
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    const { data: tokenRow, error: tokenError } = await admin.from("santa_booking_update_tokens")
      .select("id,expires_at,revoked_at").eq("booking_id", bookingId).eq("token_hash", hash).maybeSingle();
    if (tokenError || !tokenRow || tokenRow.revoked_at || new Date(tokenRow.expires_at) <= new Date()) {
      return json({ error: "The secure form link could not be verified." }, 403);
    }
    const { data: booking, error } = await admin.from("santa_bookings")
      .select("id,parent_first_name,parent_email,visit_starts_at,status,booking_source")
      .eq("id", bookingId).maybeSingle();
    if (error || !booking || booking.status === "cancelled" ||
        booking.booking_source !== "in_person" || !validEmail(booking.parent_email || "")) {
      return json({ error: "Booking or parent email unavailable." }, 404);
    }
    if (new Date(booking.visit_starts_at).getTime() <= Date.now() + 36 * 60 * 60 * 1000) {
      return json({ error: "The child details form has closed." }, 403);
    }
    const expiry = new Date(tokenRow.expires_at).toLocaleString("en-GB", {
      timeZone: "Europe/London", dateStyle: "long", timeStyle: "short",
    });
    const link = "https://hexhamsanta.co.uk/child-details.html?token=" + encodeURIComponent(token);
    const html = '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#30291f;line-height:1.6">' +
      '<h1 style="color:#142820">A little more for Santa</h1><p>Hello ' +
      esc(booking.parent_first_name || "there") +
      ',</p><p>Thank you for booking the Hexham Santa Experience. We just need a few details to help make each child’s visit special.</p>' +
      '<p><a href="' + link + '" style="display:inline-block;background:#142820;color:#fff8e9;padding:12px 18px;text-decoration:none;border-radius:6px">Complete your children’s details</a></p>' +
      '<p>This private link can be used to update your answers and expires ' + esc(expiry) +
      '. Please don’t forward it to anyone.</p><p>If you need help, reply to this email or contact hexhamchristmas@gmail.com.</p>' +
      '<p>The Hexham Christmas Team</p></body></html>';
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendKey,
        "Content-Type": "application/json",
        "Idempotency-Key": "child-info-" + tokenRow.id,
      },
      body: JSON.stringify({
        from: "Santa in Hexham <santa@updates.hexhamsanta.co.uk>",
        to: [booking.parent_email],
        reply_to: "hexhamchristmas@gmail.com",
        subject: "A little more for Santa",
        html,
        text: "Hello " + (booking.parent_first_name || "there") +
          ",\n\nPlease complete your children’s details for your Hexham Santa Experience: " + link +
          "\n\nThis private link expires " + expiry + ".\n\nThe Hexham Christmas Team",
      }),
    });
    const result = await sent.json().catch(() => ({}));
    if (!sent.ok || !result.id) {
      return json({ error: "The email could not be sent. The booking is safe and the link can be resent." }, 502);
    }
    await admin.from("santa_bookings").update({
      child_info_request_status: "sent",
      child_info_request_sent_at: new Date().toISOString(),
    }).eq("id", bookingId);
    return json({ ok: true });
  } catch (error) {
    console.error("child info email error", error);
    return json({ error: "Could not send the parent details email." }, 500);
  }
});
