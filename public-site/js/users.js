import { supabase } from "./supabase.js";

const { data: { session } } = await supabase.auth.getSession();
if (!session) window.location.replace("login.html");

const el = {
  avatar: document.querySelector("#adminAvatar"),
  adminName: document.querySelector("#adminName"),
  profileForm: document.querySelector("#profileForm"),
  profileName: document.querySelector("#profileName"),
  profileEmail: document.querySelector("#profileEmail"),
  profilePhone: document.querySelector("#profilePhone"),
  profileMessage: document.querySelector("#profileMessage"),
  staffForm: document.querySelector("#staffForm"),
  staffMessage: document.querySelector("#staffMessage"),
  listMessage: document.querySelector("#staffListMessage"),
  tbody: document.querySelector("#staffTableBody"),
  search: document.querySelector("#staffSearch"),
  createPanel: document.querySelector("#createStaffPanel")
};
let staff = [];
let resetTarget = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

async function loadProfile() {
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  if (error || !profile || profile.role !== "admin") {
    window.location.replace("admin.html");
    return;
  }
  el.profileName.value = profile.full_name || "";
  el.profileEmail.value = profile.email || session.user.email;
  el.profilePhone.value = profile.phone || "";
  el.adminName.textContent = profile.full_name || "Duyen Luong";
  el.avatar.textContent = (profile.full_name || "Duyen Luong").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

async function loadStaff() {
  el.listMessage.textContent = "Loading staff…";
  const { data, error } = await supabase.from("profiles").select("id,email,full_name,role,active,created_at").in("role", ["sales", "warehouse"]).order("created_at", { ascending: false });
  if (error) {
    el.listMessage.textContent = "Create the profiles table and RLS policies in Supabase before loading staff.";
    return;
  }
  staff = data || [];
  el.listMessage.textContent = staff.length ? "" : "No staff accounts yet.";
  renderStaff();
}

function renderStaff() {
  const query = el.search.value.trim().toLowerCase();
  const rows = staff.filter((person) => `${person.full_name} ${person.email}`.toLowerCase().includes(query));
  el.tbody.innerHTML = rows.map((person) => `
    <tr>
      <td><div class="staffIdentity"><span>${escapeHtml((person.full_name || person.email).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase())}</span><div><b>${escapeHtml(person.full_name || "Unnamed staff")}</b><small>${escapeHtml(person.email)}</small></div></div></td>
      <td><span class="roleBadge role-${person.role}">${person.role === "warehouse" ? "Warehouse" : "Sales"}</span></td>
      <td><span class="statusBadge ${person.active ? "isActive" : "isDisabled"}">${person.active ? "Active" : "Disabled"}</span></td>
      <td>${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(person.created_at))}</td>
      <td><div class="rowActions"><button class="textButton" data-action="reset-password" data-user-id="${person.id}">Reset password</button><button class="textButton" data-action="set-active" data-user-id="${person.id}" data-active="${person.active}">${person.active ? "Disable" : "Enable"}</button></div></td>
    </tr>
  `).join("");
}

el.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  el.profileMessage.textContent = "Saving…";
  const { error } = await supabase.from("profiles").update({
    full_name: el.profileName.value.trim(),
    phone: el.profilePhone.value.trim() || null,
    updated_at: new Date().toISOString()
  }).eq("id", session.user.id);
  el.profileMessage.textContent = error ? error.message : "Profile updated.";
  if (!error) await loadProfile();
});

el.staffForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  el.staffMessage.textContent = "Creating account…";
  const { data, error } = await supabase.functions.invoke("create-staff", {
    body: {
      full_name: document.querySelector("#staffName").value.trim(),
      email: document.querySelector("#staffEmail").value.trim(),
      role: document.querySelector("#staffRole").value,
      password: document.querySelector("#staffPassword").value
    }
  });
  el.staffMessage.textContent = error ? "Deploy the secure create-staff function in Supabase first." : (data?.message || "Staff account created.");
  if (!error) {
    el.staffForm.reset();
    await loadStaff();
  }
});

el.tbody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-id]");
  if (!button) return;
  if (button.dataset.action === "reset-password") {
    resetTarget = staff.find((person) => person.id === button.dataset.userId);
    document.querySelector("#resetPasswordUser").textContent = resetTarget ? `${resetTarget.full_name} · ${resetTarget.email}` : "";
    document.querySelector("#resetPasswordMessage").textContent = "";
    document.querySelector("#resetPasswordForm").reset();
    document.querySelector("#passwordDialog").showModal();
    return;
  }
  button.disabled = true;
  const { error } = await supabase.functions.invoke("manage-staff", {
    body: { action: "set_active", user_id: button.dataset.userId, active: button.dataset.active !== "true" }
  });
  if (error) {
    el.listMessage.textContent = "Deploy the secure manage-staff function in Supabase first.";
    button.disabled = false;
    return;
  }
  el.listMessage.textContent = "Staff status updated.";
  await loadStaff();
});

document.querySelector("#showCreateStaff").addEventListener("click", () => { el.createPanel.hidden = false; });
document.querySelector("#closeCreateStaff").addEventListener("click", () => { el.createPanel.hidden = true; });
document.querySelector("#closePasswordDialog").addEventListener("click", () => document.querySelector("#passwordDialog").close());
document.querySelector("#resetPasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#newStaffPassword").value;
  const confirmation = document.querySelector("#confirmStaffPassword").value;
  const resetMessage = document.querySelector("#resetPasswordMessage");
  if (password.length < 8) {
    resetMessage.textContent = "Password must contain at least 8 characters.";
    return;
  }
  if (password !== confirmation) {
    resetMessage.textContent = "Password confirmation does not match.";
    return;
  }
  resetMessage.textContent = "Resetting password…";
  const { data, error } = await supabase.functions.invoke("manage-staff", {
    body: { action: "reset_password", user_id: resetTarget.id, password }
  });
  if (error) {
    resetMessage.textContent = "Password could not be reset. Check the manage-staff function logs.";
    return;
  }
  resetMessage.textContent = data?.message || "Password reset.";
  setTimeout(() => document.querySelector("#passwordDialog").close(), 900);
});
el.search.addEventListener("input", renderStaff);
document.querySelector("#signOutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  window.location.replace("login.html");
});

if (session) {
  await loadProfile();
  await loadStaff();
}
