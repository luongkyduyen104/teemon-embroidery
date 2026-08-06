import { supabase } from "./supabase.js";

const PAGE_SIZE = 25;
let page = 0;
let total = 0;
let currentLogs = [];

const actionLabels = {
  CREATE_USER: "Created user",
  SET_PASSWORD: "Reset password",
  ACTIVATE_USER: "Activated user",
  DEACTIVATE_USER: "Deactivated user",
  CREATE_PRODUCT: "Created product",
  UPDATE_PRODUCT: "Edited product",
  PUBLISH_PRODUCT: "Published product",
  UNPUBLISH_PRODUCT: "Unpublished product",
  UPDATE_VARIANT: "Edited variant",
  UPDATE_STOCK: "Updated stock",
  CREATE_COLOR: "Created color",
  UPDATE_COLOR: "Edited color",
  ACTIVATE_COLOR: "Activated color",
  DEACTIVATE_COLOR: "Deactivated color",
  CREATE_SIZE: "Created size",
  UPDATE_SIZE: "Edited size",
  ACTIVATE_SIZE: "Activated size",
  DEACTIVATE_SIZE: "Deactivated size",
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  window.location.replace("login.html");
} else {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_root_admin, active, must_change_password")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile?.active || profile.role !== "admin") {
    window.location.replace("admin.html");
  } else if (profile.must_change_password) {
    window.location.replace("change-password.html");
  } else {
    const fullName = profile.full_name || "Duyen Luong";
    document.querySelector("#adminName").textContent = fullName;
    document.querySelector("#adminAvatar").textContent = fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    document.querySelector("#adminRole").textContent = profile.is_root_admin ? "Root Admin" : "Admin";
    await loadLogs();
  }
}

async function loadLogs() {
  const message = document.querySelector("#logMessage");
  message.textContent = "Loading activities…";

  let query = supabase
    .from("activity_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  const search = document.querySelector("#logSearch").value.trim().replace(/[%_,]/g, "");
  const action = document.querySelector("#logAction").value;
  const entity = document.querySelector("#logEntity").value;
  if (search) query = query.ilike("actor_email", `%${search}%`);
  if (action) query = query.eq("action", action);
  if (entity) query = query.eq("entity_type", entity);

  const { data, count, error } = await query;
  if (error) {
    message.textContent = error.message.includes("activity_logs")
      ? "Run migration 004_activity_logs.sql in Supabase first."
      : error.message;
    renderLogs([]);
    return;
  }

  currentLogs = data || [];
  total = count || 0;
  message.textContent = currentLogs.length ? "" : "No activities match these filters.";
  renderLogs(currentLogs);
  renderPagination();
}

function renderLogs(logs) {
  document.querySelector("#logTableBody").innerHTML = logs.map((log, index) => `
    <tr>
      <td>${escapeHtml(new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.created_at)))}</td>
      <td><b>${escapeHtml(log.actor_email || "System")}</b></td>
      <td><span class="activityBadge">${escapeHtml(actionLabels[log.action] || log.action)}</span></td>
      <td>${escapeHtml(log.entity_type)}${log.entity_id ? `<small>${escapeHtml(log.entity_id)}</small>` : ""}</td>
      <td><button class="tableAction" data-log-index="${index}" type="button">View changes</button></td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-log-index]").forEach((button) => {
    button.addEventListener("click", () => openLogDetail(currentLogs[Number(button.dataset.logIndex)]));
  });
}

function renderPagination() {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  document.querySelector("#logCount").textContent = `${total} ${total === 1 ? "activity" : "activities"}`;
  document.querySelector("#logPage").textContent = `Page ${page + 1} of ${pages}`;
  document.querySelector("#previousLogs").disabled = page === 0;
  document.querySelector("#nextLogs").disabled = page + 1 >= pages;
}

function openLogDetail(log) {
  document.querySelector("#logDialogTitle").textContent = actionLabels[log.action] || log.action;
  document.querySelector("#logDialogContent").innerHTML = `
    <dl class="logMeta">
      <div><dt>Actor</dt><dd>${escapeHtml(log.actor_email || "System")}</dd></div>
      <div><dt>Entity</dt><dd>${escapeHtml(log.entity_type)} · ${escapeHtml(log.entity_id || "—")}</dd></div>
      <div><dt>Time</dt><dd>${escapeHtml(new Date(log.created_at).toLocaleString())}</dd></div>
    </dl>
    <div class="logChanges">
      <section><h3>Before</h3><pre>${escapeHtml(JSON.stringify(log.before_data, null, 2) || "No previous data")}</pre></section>
      <section><h3>After</h3><pre>${escapeHtml(JSON.stringify(log.after_data, null, 2) || "No new data")}</pre></section>
    </div>
  `;
  document.querySelector("#logDialog").showModal();
}

document.querySelector("#applyLogFilters").addEventListener("click", async () => {
  page = 0;
  await loadLogs();
});
document.querySelector("#logSearch").addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    page = 0;
    await loadLogs();
  }
});
document.querySelector("#previousLogs").addEventListener("click", async () => {
  if (page > 0) page -= 1;
  await loadLogs();
});
document.querySelector("#nextLogs").addEventListener("click", async () => {
  if ((page + 1) * PAGE_SIZE < total) page += 1;
  await loadLogs();
});
document.querySelector("#closeLogDialog").addEventListener("click", () => document.querySelector("#logDialog").close());
document.querySelector("#signOutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  window.location.replace("login.html");
});
