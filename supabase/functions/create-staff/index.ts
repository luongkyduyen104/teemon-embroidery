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

  const { data: caller } = await adminClient
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (!caller?.active || caller.role !== "admin") {
    return json({ error: "Admin permission required" }, 403);
  }

  const body = await request.json().catch(() => null);
  const fullName = String(body?.full_name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const role = String(body?.role || "").toLowerCase();

  if (!fullName || !email || password.length < 8) {
    return json({ error: "Full name, valid email and password of at least 8 characters are required" }, 400);
  }
  if (!["sales", "warehouse"].includes(role)) {
    return json({ error: "Staff role must be Sales or Warehouse" }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role },
  });

  if (createError || !created.user) {
    return json({ error: createError?.message || "Unable to create staff account" }, 400);
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ full_name: fullName, role, active: true, is_root_admin: false, must_change_password: true })
    .eq("id", created.user.id);

  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: "Unable to create staff profile" }, 500);
  }

  const { error: auditError } = await adminClient.from("activity_logs").insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action: "CREATE_USER",
    entity_type: "user",
    entity_id: created.user.id,
    after_data: { email, full_name: fullName, role, active: true },
    metadata: { source: "users_page" },
  });

  if (auditError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: "Staff was not created because the activity log could not be written" }, 500);
  }

  return json({
    message: `${role === "sales" ? "Sales" : "Warehouse"} account created.`,
    user: { id: created.user.id, email, full_name: fullName, role },
  }, 201);
});
