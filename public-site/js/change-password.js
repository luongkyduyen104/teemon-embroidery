import { supabase } from "./supabase.js";

const form = document.querySelector("#changePasswordForm");
const message = document.querySelector("#changePasswordMessage");
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  window.location.replace("login.html");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#newPassword").value;
  const confirmation = document.querySelector("#confirmPassword").value;
  if (password.length < 8) {
    message.textContent = "Password must contain at least 8 characters.";
    return;
  }
  if (password !== confirmation) {
    message.textContent = "Password confirmation does not match.";
    return;
  }

  message.textContent = "Changing password…";
  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) {
    message.textContent = passwordError.message;
    return;
  }

  const { error: profileError } = await supabase.rpc("complete_password_change");
  if (profileError) {
    message.textContent = "Password changed, but account status could not be updated. Contact an administrator.";
    return;
  }

  await supabase.auth.signOut({ scope: "local" });
  window.location.replace("login.html?password_changed=1");
});
