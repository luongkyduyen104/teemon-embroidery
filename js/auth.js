import { supabase } from "./supabase.js";

const form = document.querySelector("#loginForm");
const message = document.querySelector("#loginMessage");

async function continueWithSession(session) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, active, must_change_password")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !profile) {
    message.textContent = "Account profile is not available. Contact an administrator.";
    return;
  }
  if (!profile.active) {
    await supabase.auth.signOut({ scope: "local" });
    message.textContent = "This account is disabled.";
    return;
  }
  if (profile.must_change_password) {
    window.location.replace("change-password.html");
    return;
  }
  const requestedReturn = new URLSearchParams(window.location.search).get("returnTo");
  const defaultDestination = profile.role === "sales" ? "catalog.html" : "admin.html";
  const safeReturn = requestedReturn && /^[a-z0-9_-]+\.html(?:\?[a-z0-9_=&%.-]+)?$/i.test(requestedReturn)
    ? requestedReturn
    : defaultDestination;
  window.location.replace(safeReturn);
}

if (new URLSearchParams(window.location.search).get("password_changed") === "1") {
  message.textContent = "Password changed. Sign in with your new password.";
}
if (new URLSearchParams(window.location.search).get("session_expired") === "1") {
  message.textContent = "Your session expired. Please sign in again to continue.";
}

const { data: { session } } = await supabase.auth.getSession();
if (session) await continueWithSession(session);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  message.textContent = "Signing in…";

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    message.textContent = "Email hoặc mật khẩu không đúng.";
    return;
  }
  await continueWithSession(data.session);
});
