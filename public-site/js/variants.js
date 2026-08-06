import { supabase } from "./supabase.js";

const shippingRegions = [
  ["us", "US"],
  ["canada", "Canada"],
  ["europe", "Europe"],
  ["uk", "UK"],
  ["australia", "Australia"],
  ["rest_of_world", "Rest of World"],
];

let profile;
let allVariants = [];
let visibleVariants = [];
const variantsPerPage = 50;
let currentVariantPage = 1;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]);

const normalizeSkuPart = (value) => String(value ?? "")
  .trim()
  .replace(/\s+/g, "-")
  .replace(/[^a-zA-Z0-9-]/g, "")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "")
  .toUpperCase();

const makeSku = (productCode, colorCode, sizeCode) => [productCode, colorCode, sizeCode]
  .map(normalizeSkuPart)
  .filter(Boolean)
  .join("-");

const blankIfMissing = (value) => value === null || value === undefined || value === "" ? "" : value;

const formatMoney = (value, currency = "USD") => {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(value));
};

const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  window.location.replace("login.html");
} else {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, role, is_root_admin, active, must_change_password")
    .eq("id", session.user.id)
    .maybeSingle();
  profile = data;
  if (!profile?.active) {
    await supabase.auth.signOut({ scope: "local" });
    window.location.replace("login.html");
  } else if (profile.must_change_password) {
    window.location.replace("change-password.html");
  } else if (profile.role === "sales") {
    window.location.replace("catalog.html");
  } else {
    applyProfile();
    await loadVariants();
  }
}

function applyProfile() {
  const fullName = profile.full_name || session.user.email;
  document.querySelector("#adminName").textContent = fullName;
  document.querySelector("#adminAvatar").textContent = fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  document.querySelector("#adminRole").textContent = profile.is_root_admin ? "Root Admin" : ({
    admin: "Admin", sales: "Sales", warehouse: "Warehouse",
  })[profile.role];
  if (profile.role !== "admin") {
    document.querySelector("#usersNavLink")?.remove();
    document.querySelector("#activityLogsNavLink")?.remove();
  }
}

async function loadVariants() {
  const message = document.querySelector("#variantMessage");
  message.textContent = "Loading variants…";
  const [{ data: productColors, error: colorError }, { data: productSizes, error: sizeError }] = await Promise.all([
    supabase
      .from("product_colors")
      .select("product_id, color_id, products(id, product_name, product_code), colors(id, name, code)"),
    supabase
      .from("product_sizes")
      .select("product_id, size_id, sizes(id, name, code, display_order)"),
  ]);

  if (colorError || sizeError) {
    message.textContent = `Variants could not connect to products: ${(colorError || sizeError).message}`;
    return;
  }

  const sizesByProduct = new Map();
  (productSizes || []).forEach((row) => {
    if (!sizesByProduct.has(row.product_id)) sizesByProduct.set(row.product_id, []);
    sizesByProduct.get(row.product_id).push(row);
  });

  const baseRows = (productColors || []).flatMap((colorRow) => (
    sizesByProduct.get(colorRow.product_id) || []
  ).map((sizeRow) => ({
    id: `${colorRow.product_id}-${colorRow.color_id}-${sizeRow.size_id}`,
    active: true,
    product_id: colorRow.product_id,
    color_id: colorRow.color_id,
    size_id: sizeRow.size_id,
    products: colorRow.products,
    colors: colorRow.colors,
    sizes: sizeRow.sizes,
  })));

  const productIds = [...new Set(baseRows.map((row) => row.product_id))];
  const fulfillmentByProduct = new Map();

  await Promise.all(productIds.map(async (productId) => {
    const { data: fulfillment, error: fulfillmentError } = await supabase.rpc("admin_product_fulfillment", {
      p_product_id: productId,
    });
    if (!fulfillmentError) {
      fulfillmentByProduct.set(productId, new Map((fulfillment || []).map((item) => [item.size_id, item])));
    }
  }));

  allVariants = baseRows.map((row) => {
    const fulfillment = fulfillmentByProduct.get(row.product_id)?.get(row.size_id) || {};
    return {
      ...row,
      sku: makeSku(row.products?.product_code, row.colors?.code, row.sizes?.code),
      weight_grams: fulfillment.weight_grams ?? null,
      base_cost: fulfillment.base_cost ?? null,
      shipping_estimates: fulfillment.shipping_estimates || {},
      currency: fulfillment.currency || "USD",
    };
  }).sort((a, b) => (
    String(a.products?.product_name).localeCompare(String(b.products?.product_name))
    || String(a.colors?.name).localeCompare(String(b.colors?.name))
    || (Number(a.sizes?.display_order) - Number(b.sizes?.display_order))
    || String(a.sizes?.name).localeCompare(String(b.sizes?.name))
  ));

  populateFilters();
  applyFilters();
  message.textContent = allVariants.length
    ? "Variants are synchronized from the colors and sizes selected in Products."
    : "No variants yet. Select at least one color and one size in a product first.";
  document.querySelector("#exportVariantsBtn").disabled = !allVariants.length;
}

function populateSelect(selector, rows, valueKey, labelKey) {
  const select = document.querySelector(selector);
  const firstOption = select.options[0].outerHTML;
  const unique = [...new Map(rows.filter(Boolean).map((row) => [row[valueKey], row])).values()]
    .sort((a, b) => String(a[labelKey]).localeCompare(String(b[labelKey])));
  select.innerHTML = firstOption + unique.map((row) => `<option value="${escapeHtml(row[valueKey])}">${escapeHtml(row[labelKey])}</option>`).join("");
}

function populateFilters() {
  populateSelect("#variantProductFilter", allVariants.map((row) => row.products), "id", "product_name");
  populateSelect("#variantColorFilter", allVariants.map((row) => row.colors), "id", "name");
  populateSelect("#variantSizeFilter", allVariants.map((row) => row.sizes), "id", "name");
}

function applyFilters() {
  const search = document.querySelector("#variantSearch").value.trim().toLowerCase();
  const productId = document.querySelector("#variantProductFilter").value;
  const colorId = document.querySelector("#variantColorFilter").value;
  const sizeId = document.querySelector("#variantSizeFilter").value;

  visibleVariants = allVariants.filter((row) => {
    const haystack = [row.products?.product_name, row.products?.product_code, row.colors?.name, row.colors?.code, row.sizes?.name, row.sizes?.code, row.sku]
      .join(" ").toLowerCase();
    return (!search || haystack.includes(search))
      && (!productId || row.product_id === productId)
      && (!colorId || row.color_id === colorId)
      && (!sizeId || row.size_id === sizeId);
  });
  currentVariantPage = 1;
  renderVariants();
}

function renderVariants() {
  const body = document.querySelector("#variantTableBody");
  const totalPages = Math.max(1, Math.ceil(visibleVariants.length / variantsPerPage));
  currentVariantPage = Math.min(Math.max(1, currentVariantPage), totalPages);
  const firstIndex = (currentVariantPage - 1) * variantsPerPage;
  const pageVariants = visibleVariants.slice(firstIndex, firstIndex + variantsPerPage);
  const firstVisible = visibleVariants.length ? firstIndex + 1 : 0;
  const lastVisible = visibleVariants.length ? firstIndex + pageVariants.length : 0;

  document.querySelector("#variantCount").textContent = visibleVariants.length;
  document.querySelector("#variantRange").textContent = `${firstVisible}–${lastVisible}`;
  document.querySelector("#variantTotal").textContent = visibleVariants.length;
  document.querySelector("#variantPageStatus").textContent = `Page ${currentVariantPage} of ${totalPages}`;
  document.querySelector("#variantPreviousPage").disabled = currentVariantPage <= 1;
  document.querySelector("#variantNextPage").disabled = currentVariantPage >= totalPages;
  document.querySelector("#exportVariantsBtn").disabled = !visibleVariants.length;
  body.innerHTML = pageVariants.length ? pageVariants.map((row) => `
    <tr>
      <td><div class="variantProduct"><b>${escapeHtml(row.products?.product_name)}</b></div></td>
      <td>${escapeHtml(row.colors?.name)}</td>
      <td><b>${escapeHtml(row.sizes?.name)}</b></td>
      <td><code>${escapeHtml(row.products?.product_code)}</code></td>
      <td><code class="skuCode">${escapeHtml(row.sku)}</code></td>
      <td class="numberCell">${row.weight_grams == null ? "—" : escapeHtml(row.weight_grams)}</td>
      <td class="numberCell">${formatMoney(row.base_cost, row.currency)}</td>
      ${shippingRegions.map(([code]) => `<td class="numberCell">${formatMoney(row.shipping_estimates?.[code], row.currency)}</td>`).join("")}
      <td><span class="statusBadge isActive">Active</span></td>
    </tr>
  `).join("") : `<tr><td colspan="14" class="emptyTableCell">No variants match these filters.</td></tr>`;
}

function changeVariantPage(direction) {
  const totalPages = Math.max(1, Math.ceil(visibleVariants.length / variantsPerPage));
  currentVariantPage = Math.min(Math.max(1, currentVariantPage + direction), totalPages);
  renderVariants();
  document.querySelector(".variantsPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function exportExcel() {
  const button = document.querySelector("#exportVariantsBtn");
  const message = document.querySelector("#variantMessage");
  button.disabled = true;
  button.textContent = "Preparing…";
  try {
    const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
    const rows = visibleVariants.map((row) => ({
      "Product": row.products?.product_name || "",
      "Color": row.colors?.name || "",
      "Size": row.sizes?.name || "",
      "Product Code": row.products?.product_code || "",
      "SKU": row.sku,
      "Weight (g)": blankIfMissing(row.weight_grams),
      "Base Cost (USD)": blankIfMissing(row.base_cost),
      "Shipping US (USD)": blankIfMissing(row.shipping_estimates?.us),
      "Shipping Canada (USD)": blankIfMissing(row.shipping_estimates?.canada),
      "Shipping Europe (USD)": blankIfMissing(row.shipping_estimates?.europe),
      "Shipping UK (USD)": blankIfMissing(row.shipping_estimates?.uk),
      "Shipping Australia (USD)": blankIfMissing(row.shipping_estimates?.australia),
      "Shipping Rest of World (USD)": blankIfMissing(row.shipping_estimates?.rest_of_world),
      "Currency": row.currency,
      "Status": row.active ? "Active" : "Inactive",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!autofilter"] = { ref: worksheet["!ref"] };
    worksheet["!cols"] = [
      { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 34 }, { wch: 13 }, { wch: 17 },
      ...shippingRegions.map(() => ({ wch: 22 })), { wch: 12 }, { wch: 12 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Variants");
    XLSX.writeFile(workbook, `teemon-variants-${new Date().toISOString().slice(0, 10)}.xlsx`);
    message.textContent = `${visibleVariants.length} variants exported to Excel.`;
  } catch (error) {
    message.textContent = `Excel export failed: ${error.message}`;
  } finally {
    button.disabled = !visibleVariants.length;
    button.textContent = "⇩ Export Excel";
  }
}

["#variantSearch", "#variantProductFilter", "#variantColorFilter", "#variantSizeFilter"].forEach((selector) => {
  document.querySelector(selector).addEventListener(selector === "#variantSearch" ? "input" : "change", applyFilters);
});

document.querySelector("#exportVariantsBtn").addEventListener("click", exportExcel);
document.querySelector("#variantPreviousPage").addEventListener("click", () => changeVariantPage(-1));
document.querySelector("#variantNextPage").addEventListener("click", () => changeVariantPage(1));
document.querySelector("#signOutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  window.location.replace("login.html");
});
