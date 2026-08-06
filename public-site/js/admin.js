import { supabase } from "./supabase.js";

let refreshTimer;
const el = {
  total: document.querySelector("#totalProducts"),
  thisMonth: document.querySelector("#productsThisMonth"),
  published: document.querySelector("#publishedProducts"),
  publishedPercent: document.querySelector("#publishedPercent"),
  draft: document.querySelector("#draftProducts"),
  unpublished: document.querySelector("#unpublishedProducts"),
  sidebarTotal: document.querySelector("#sidebarProductCount"),
  missingImages: document.querySelector("#missingImages"),
  missingOptions: document.querySelector("#missingOptions"),
  missingCharts: document.querySelector("#missingCharts"),
  health: document.querySelector("#catalogHealthPercent"),
  donut: document.querySelector("#catalogDonut"),
  readyDrafts: document.querySelector("#readyDrafts"),
  warnings: document.querySelector("#warningProducts"),
  blockedDrafts: document.querySelector("#blockedDrafts"),
  liveStatus: document.querySelector("#liveStatus"),
};

const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  window.location.replace("login.html");
} else {
  const { data: profile } = await supabase.from("profiles").select("full_name, role, is_root_admin, active, must_change_password").eq("id", session.user.id).maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut({ scope: "local" });
    window.location.replace("login.html");
  } else if (profile.must_change_password) {
    window.location.replace("change-password.html");
  } else {
    applyProfile(profile);
    await refreshDashboard();
    startRealtime();
  }
}

function applyProfile(profile) {
  const fullName = profile.full_name || "Duyen Luong";
  const firstName = fullName.trim().split(/\s+/)[0] || "Duyen";
  document.querySelector("#adminName").textContent = fullName;
  document.querySelector("#welcomeName").textContent = firstName;
  document.querySelector("#adminAvatar").textContent = fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const roleLabels = { admin: profile.is_root_admin ? "Root Admin" : "Admin", sales: "Sales", warehouse: "Warehouse" };
  document.querySelector("#adminRole").textContent = roleLabels[profile.role] || "User";
  if (profile.role !== "admin") {
    document.querySelector("#usersNavLink")?.remove();
    document.querySelector("#activityLogsNavLink")?.remove();
  }
  if (profile.role === "sales") {
    document.querySelectorAll(".sidebar nav a").forEach((link) => {
      const destination = link.getAttribute("href");
      if (destination !== "admin.html" && destination !== "catalog.html") link.remove();
    });
  }
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
}

async function refreshDashboard() {
  const { data, error } = await supabase.rpc("dashboard_stats");
  if (error) {
    el.liveStatus.textContent = "Unable to refresh";
    el.liveStatus.className = "liveStatus isOffline";
    return;
  }
  renderStats(data);
}

function renderStats(stats) {
  el.total.textContent = stats.total_products;
  el.thisMonth.textContent = `${stats.products_this_month} created this month`;
  el.published.textContent = stats.published_products;
  el.publishedPercent.textContent = `${stats.published_percent}% of catalog`;
  el.draft.textContent = stats.draft_products;
  el.unpublished.textContent = stats.unpublished_products;
  el.sidebarTotal.textContent = stats.total_products;
  el.missingImages.textContent = `${stats.missing_images} products`;
  el.missingOptions.textContent = `${stats.missing_options} products`;
  el.missingCharts.textContent = `${stats.missing_charts} products`;
  el.health.textContent = `${stats.published_percent}%`;
  el.donut.style.background = `conic-gradient(#1e5141 0 ${stats.published_percent}%,#e5e8e2 ${stats.published_percent}%)`;
  el.readyDrafts.textContent = stats.ready_drafts;
  el.warnings.textContent = stats.warning_products;
  el.blockedDrafts.textContent = stats.blocked_drafts;
  if (!el.liveStatus.classList.contains("isLive")) el.liveStatus.textContent = "Updated just now";
}

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshDashboard, 350);
}

function startRealtime() {
  const channel = supabase.channel("dashboard-live");
  ["products", "product_images", "product_charts", "product_colors", "product_sizes"].forEach((table) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      el.liveStatus.textContent = "Live";
      el.liveStatus.className = "liveStatus isLive";
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      el.liveStatus.textContent = "Syncing every 30 seconds";
      el.liveStatus.className = "liveStatus isOffline";
    }
  });
  window.setInterval(refreshDashboard, 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshDashboard();
  });
}

document.querySelector("#signOutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  window.location.replace("login.html");
});
