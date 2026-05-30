import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeSubscription(row: any) {
  if (row.subscription?.endpoint && row.subscription?.keys?.p256dh && row.subscription?.keys?.auth) {
    return row.subscription;
  }
  if (row.endpoint && row.p256dh && row.auth) {
    return {
      endpoint: row.endpoint,
      expirationTime: row.expiration_time || null,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ error: "Missing Supabase/VAPID secrets" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  webpush.setVapidDetails("mailto:duskomacak@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }

  const appointmentId = body.appointment_id || body.appointmentId || null;
  let salonId = body.salon_id || body.salonId || null;
  let appointment: any = null;

  if (appointmentId) {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, salon_id, client_name, client_phone, appointment_date, appointment_time, service_name_snapshot, duration_snapshot, status")
      .eq("id", appointmentId)
      .maybeSingle();
    if (error) console.error("Appointment lookup failed", error);
    appointment = data || null;
    salonId = salonId || appointment?.salon_id || null;
  }

  if (!salonId) return jsonResponse({ error: "Missing salon_id" }, 400);

  const { data: subs, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, salon_id, endpoint, p256dh, auth, expiration_time, subscription, user_agent, is_active")
    .eq("salon_id", salonId)
    .eq("is_active", true);

  if (subError) return jsonResponse({ error: subError.message }, 500);

  const payload = JSON.stringify({
    title: body.title || "🔔 NOVI TERMIN",
    body: body.body || `${appointment?.client_name || body.client_name || "Klijent"} • ${appointment?.service_name_snapshot || body.service_name || "Usluga"} • ${String(appointment?.appointment_time || body.appointment_time || "").slice(0, 5)}`,
    appointment_id: appointmentId,
    salon_id: salonId,
    client_name: appointment?.client_name || body.client_name || "Klijent",
    client_phone: appointment?.client_phone || body.client_phone || "",
    appointment_date: appointment?.appointment_date || body.appointment_date || "",
    appointment_time: appointment?.appointment_time || body.appointment_time || "",
    service_name: appointment?.service_name_snapshot || body.service_name || "Usluga",
    badgeCount: body.badgeCount || 1,
    urgent: body.urgent !== false,
    open_url: body.open_url || `/salon/?section=appointments&from_push=1${appointmentId ? `&appointment_id=${encodeURIComponent(appointmentId)}` : ""}`,
  });

  let sent = 0;
  let failed = 0;
  let deactivated = 0;

  for (const row of subs || []) {
    const subscription = makeSubscription(row);
    if (!subscription) {
      failed += 1;
      await supabase.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", row.id);
      deactivated += 1;
      continue;
    }

    try {
      await webpush.sendNotification(subscription, payload);
      sent += 1;
      console.log("Push sent", { subscription_id: row.id });
    } catch (err: any) {
      failed += 1;
      const status = Number(err?.statusCode || err?.status || 0);
      console.error("Push failed", { subscription_id: row.id, status, body: err?.body || String(err?.message || err) });
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", row.id);
        deactivated += 1;
        console.log("Dead push subscription deactivated", { subscription_id: row.id });
      }
    }
  }

  return jsonResponse({ ok: true, salon_id: salonId, subscriptions: subs?.length || 0, sent, failed, deactivated });
});
