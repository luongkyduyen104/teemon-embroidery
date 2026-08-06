import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "Invalid session" }, 401);

  const { data: caller } = await adminClient.from("profiles").select("role, active").eq("id", user.id).single();
  if (!caller?.active || caller.role !== "admin") {
    return json({ error: "Admin permission required" }, 403);
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "set_active");
  const userId = String(body?.user_id || "");
  if (!userId) return json({ error: "user_id is required" }, 400);

  const { data: target } = await adminClient
    .from("profiles")
    .select("email, full_name, role, active, is_root_admin, must_change_password")
    .eq("id", userId)
    .single();
  if (!target || !["sales", "warehouse"].includes(target.role) || target.is_root_admin) {
    return json({ error: "Only Sales or Warehouse accounts can be changed here" }, 403);
  }

  if (action === "reset_password") {
    const password = String(body?.password || "");
    if (password.length < 8) return json({ error: "Password must contain at least 8 characters" }, 400);

    const { error: passwordError } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (passwordError) return json({ error: passwordError.message }, 400);

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ must_change_password: true, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (profileError) return json({ error: profileError.message }, 400);

    const { error: auditError } = await adminClient.from("activity_logs").insert({
      actor_user_id: user.id,
      actor_email: user.email,
      action: "SET_PASSWORD",
      entity_type: "user",
      entity_id: userId,
      before_data: { must_change_password: target.must_change_password },
      after_data: { must_change_password: true },
      metadata: { target_email: target.email, source: "users_page" },
    });
    if (auditError) {
      return json({
        message: "Temporary password set. Staff must change it after signing in.",
        warning: "The password changed, but its activity log could not be written.",
      });
    }

    return json({ message: "Temporary password set. Staff must change it after signing in." });
  }

  if (action === "set_active") {
    const active = body?.active;
    if (typeof active !== "boolean") return json({ error: "active is required" }, 400);

    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: active ? "none" : "876000h",
    });
    if (authError) return json({ error: authError.message }, 400);

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (profileError) return json({ error: profileError.message }, 400);

    const { error: auditError } = await adminClient.from("activity_logs").insert({
      actor_user_id: user.id,
      actor_email: user.email,
      action: active ? "ACTIVATE_USER" : "DEACTIVATE_USER",
      entity_type: "user",
      entity_id: userId,
      before_data: { active: target.active },
      after_data: { active },
      metadata: { target_email: target.email, source: "users_page" },
    });
    if (auditError) {
      return json({
        message: active ? "Staff account enabled." : "Staff account disabled.",
        warning: "The account changed, but its activity log could not be written.",
      });
    }

    return json({ message: active ? "Staff account enabled." : "Staff account disabled." });
  }

  return json({ error: "Unsupported action" }, 400);
});
