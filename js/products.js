const api = window.teemonApi;
const PAGE_SIZE = 25;
let page = 0;
let total = 0;
let profile = null;
let currentProducts = [];
const selectedProductIds = new Set();

const el = {
  tbody: document.querySelector("#productTableBody"),
  message: document.querySelector("#productMessage"),
  search: document.querySelector("#productSearch"),
  category: document.querySelector("#productCategory"),
  status: document.querySelector("#productStatus"),
  count: document.querySelector("#productCount"),
  sidebarCount: document.querySelector("#sidebarProductCount"),
  page: document.querySelector("#productPage"),
  previous: document.querySelector("#previousProducts"),
  next: document.querySelector("#nextProducts"),
  successNotice: document.querySelector("#productSuccessNotice"),
  successTitle: document.querySelector("#productSuccessTitle"),
  successMessage: document.querySelector("#productSuccessMessage"),
  selectAll: document.querySelector("#selectAllProducts"),
  bulkActions: document.querySelector("#bulkProductActions"),
  selectedCount: document.querySelector("#selectedProductCount"),
  publishSelected: document.querySelector("#publishSelectedProducts"),
  deactivateSelected: document.querySelector("#deactivateSelectedProducts"),
  deleteSelected: document.querySelector("#deleteSelectedProducts"),
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]);

initialize();

async function initialize() {
  try {
    const session = api?.getSession();
    if (!session?.user?.id) {
      window.location.replace("login.html");
      return;
    }
    const rows = await api.select(
      "profiles",
      `select=full_name,role,is_root_admin,active,must_change_password&id=eq.${encodeURIComponent(session.user.id)}`
    );
    profile = rows?.[0];
    if (!profile?.active) {
      await api.signOut();
      window.location.replace("login.html");
      return;
    }
    if (profile.must_change_password) {
      window.location.replace("change-password.html");
      return;
    }
    if (profile.role === "sales") {
      window.location.replace("catalog.html");
      return;
    }
    applyProfile(session);
    showSuccessNotice();
    await loadCategories();
    await loadProducts();
  } catch (error) {
    el.message.textContent = `Products could not connect to Supabase: ${error.message}`;
  }
}

function applyProfile(session) {
  const fullName = profile.full_name || session.user.email;
  document.querySelector("#adminName").textContent = fullName;
  document.querySelector("#adminAvatar").textContent = fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  document.querySelector("#adminRole").textContent = profile.is_root_admin ? "Root Admin" : ({
    admin: "Admin", sales: "Sales", warehouse: "Warehouse"
  })[profile.role];
  if (profile.role !== "admin") {
    document.querySelector("#newProductButton")?.remove();
    document.querySelector("#importProductButton")?.remove();
    document.querySelector("#usersNavLink")?.remove();
    document.querySelector("#activityLogsNavLink")?.remove();
  }
}

function showSuccessNotice() {
  const url = new URL(window.location.href);
  const wasCreated = url.searchParams.has("created");
  const wasUpdated = url.searchParams.has("updated");
  const statusChanged = url.searchParams.get("statusChanged");
  const wasImported = url.searchParams.has("imported");
  const fulfillmentUpdated = url.searchParams.has("fulfillmentUpdated");
  if (!wasCreated && !wasUpdated && !statusChanged && !wasImported && !fulfillmentUpdated) return;
  if (fulfillmentUpdated) {
    const result = JSON.parse(sessionStorage.getItem("teemonProductImportResult") || "{}");
    const count = Number(result.fulfillmentCount || 0);
    el.successTitle.textContent = "Fulfillment prices updated";
    el.successMessage.textContent = `${count} product-size price row${count === 1 ? "" : "s"} updated from Excel.`;
    sessionStorage.removeItem("teemonProductImportResult");
  } else if (wasImported) {
    const result = JSON.parse(sessionStorage.getItem("teemonProductImportResult") || "{}");
    const count = Number(result.count || 0);
    el.successTitle.textContent = "Excel import completed";
    el.successMessage.textContent = `${count} Draft product${count === 1 ? "" : "s"} added to the product list.`;
    sessionStorage.removeItem("teemonProductImportResult");
  } else if (wasUpdated) {
    el.successTitle.textContent = "Product updated successfully";
    el.successMessage.textContent = "Product details, colors and sizes have been saved.";
  } else if (statusChanged === "PUBLISHED") {
    el.successTitle.textContent = "Product is now active";
    el.successMessage.textContent = "The product is published and visible in the public catalog.";
  } else if (statusChanged === "UNPUBLISHED") {
    el.successTitle.textContent = "Product deactivated";
    el.successMessage.textContent = "The product has been removed from the public catalog.";
  }
  el.successNotice.hidden = false;
  url.searchParams.delete("created");
  url.searchParams.delete("updated");
  url.searchParams.delete("statusChanged");
  url.searchParams.delete("imported");
  url.searchParams.delete("fulfillmentUpdated");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  window.setTimeout(() => { el.successNotice.hidden = true; }, 5000);
}

async function loadCategories() {
  const data = await api.select("categories", "select=id,name&is_active=eq.true&order=name.asc");
  el.category.insertAdjacentHTML("beforeend", (data || []).map((category) =>
    `<option value="${category.id}">${escapeHtml(category.name)}</option>`
  ).join(""));
}

async function loadProducts() {
  el.message.textContent = "Loading products…";
  try {
    const products = await api.rpc("list_products", {
      p_search: el.search.value.trim() || null,
      p_category_id: el.category.value || null,
      p_status: el.status.value || null,
      p_offset: page * PAGE_SIZE,
      p_limit: PAGE_SIZE,
    });
    total = Number(products?.[0]?.total_count || 0);
    el.message.textContent = products?.length ? "" : "No products match these filters.";
    renderProducts(products || []);
    renderPagination();
  } catch (error) {
    el.message.textContent = `${error.message}. Run migration 011_product_list_rpc.sql.`;
    total = 0;
    renderProducts([]);
    renderPagination();
  }
}

function renderProducts(products) {
  currentProducts = products;
  selectedProductIds.clear();
  updateBulkActions();
  el.tbody.innerHTML = products.map((product) => `
    <tr>
      <td class="selectColumn"><input class="productSelect" type="checkbox" value="${escapeHtml(product.id)}" aria-label="Select ${escapeHtml(product.product_name)}" ${profile.role !== "admin" || product.publication_status === "ARCHIVED" ? "disabled" : ""}></td>
      <td><div class="productIdentity"><span>${escapeHtml(product.product_name.slice(0, 1).toUpperCase())}</span><div><b>${escapeHtml(product.product_name)}</b><small>${escapeHtml(product.product_code)}</small></div></div></td>
      <td>${escapeHtml(product.category_name || "—")}</td>
      <td><span class="statusBadge status-${product.publication_status.toLowerCase()}">${escapeHtml(product.publication_status)}</span></td>
      <td>${escapeHtml(new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(product.updated_at)))}</td>
      <td>${escapeHtml(product.updated_by_name || "—")}</td>
      <td>${profile.role === "admin" ? `<a class="tableAction" href="product-edit.html?id=${encodeURIComponent(product.id)}">Edit</a>` : `<span class="mutedText">View only</span>`}</td>
      <td class="productViewColumn">${product.publication_status === "PUBLISHED" && product.slug ? `<a class="tableAction" href="product.html?slug=${encodeURIComponent(product.slug)}" target="_blank" rel="noopener" aria-label="View ${escapeHtml(product.product_name)} in the published catalog" title="Open published catalog page">View</a>` : `<span class="mutedText" title="Publish this product to create a public catalog link">&mdash;</span>`}</td>
      <td class="featuredColumn">${profile.role === "admin" ? `<button class="featuredToggle ${product.is_featured ? "isFeatured" : ""}" type="button" data-feature-product="${escapeHtml(product.id)}" aria-label="${product.is_featured ? "Remove" : "Add"} ${escapeHtml(product.product_name)} ${product.is_featured ? "from" : "to"} featured products" title="${product.publication_status === "PUBLISHED" ? "Show this product on the home page" : "Publish this product before featuring it"}" ${product.publication_status !== "PUBLISHED" ? "disabled" : ""}>${product.is_featured ? "&#9733;" : "&#9734;"}</button>` : ""}</td>
    </tr>
  `).join("");
}

function updateBulkActions() {
  const count = selectedProductIds.size;
  const selectedProducts = currentProducts.filter((product) => selectedProductIds.has(product.id));
  const publishable = selectedProducts.filter((product) => ["DRAFT", "UNPUBLISHED"].includes(product.publication_status));
  const deactivatable = selectedProducts.filter((product) => product.publication_status !== "ARCHIVED" && product.publication_status !== "UNPUBLISHED");
  const deletable = selectedProducts.filter((product) => product.publication_status !== "ARCHIVED");
  el.selectedCount.textContent = count;
  el.bulkActions.hidden = profile?.role !== "admin" || count === 0;
  el.publishSelected.hidden = publishable.length === 0;
  el.publishSelected.disabled = publishable.length === 0;
  el.deactivateSelected.hidden = deactivatable.length === 0;
  el.deactivateSelected.disabled = deactivatable.length === 0;
  el.deleteSelected.hidden = deletable.length === 0;
  el.deleteSelected.disabled = deletable.length === 0;
  const selectable = currentProducts.filter((product) => product.publication_status !== "ARCHIVED").length;
  el.selectAll.disabled = profile?.role !== "admin" || selectable === 0;
  el.selectAll.checked = selectable > 0 && count === selectable;
  el.selectAll.indeterminate = count > 0 && count < selectable;
}

function renderPagination() {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  el.count.textContent = `${total} ${total === 1 ? "product" : "products"}`;
  el.sidebarCount.textContent = total;
  el.page.textContent = `Page ${page + 1} of ${pages}`;
  el.previous.disabled = page === 0;
  el.next.disabled = page + 1 >= pages;
}

let searchTimer;
el.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => { page = 0; await loadProducts(); }, 300);
});
el.category.addEventListener("change", async () => { page = 0; await loadProducts(); });
el.status.addEventListener("change", async () => { page = 0; await loadProducts(); });
el.previous.addEventListener("click", async () => { if (page > 0) page -= 1; await loadProducts(); });
el.next.addEventListener("click", async () => { if ((page + 1) * PAGE_SIZE < total) page += 1; await loadProducts(); });
el.tbody.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".productSelect");
  if (!checkbox) return;
  if (checkbox.checked) selectedProductIds.add(checkbox.value);
  else selectedProductIds.delete(checkbox.value);
  updateBulkActions();
});
el.tbody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-feature-product]");
  if (!button) return;
  button.disabled = true;
  el.message.textContent = "Updating featured products...";
  try {
    await api.rpc("toggle_featured_product", { p_product_id: button.dataset.featureProduct });
    await loadProducts();
  } catch (error) {
    el.message.textContent = error.message;
    button.disabled = false;
  }
});
el.selectAll.addEventListener("change", () => {
  selectedProductIds.clear();
  if (el.selectAll.checked) currentProducts.filter((product) => product.publication_status !== "ARCHIVED").forEach((product) => selectedProductIds.add(product.id));
  el.tbody.querySelectorAll(".productSelect").forEach((checkbox) => {
    checkbox.checked = selectedProductIds.has(checkbox.value);
  });
  updateBulkActions();
});
el.deactivateSelected.addEventListener("click", async () => {
  const ids = currentProducts.filter((product) =>
    selectedProductIds.has(product.id) && !["ARCHIVED", "UNPUBLISHED"].includes(product.publication_status)
  ).map((product) => product.id);
  if (!ids.length || !window.confirm(`Deactivate ${ids.length} selected product${ids.length === 1 ? "" : "s"}? Published products will be removed from the public catalog.`)) return;
  el.deactivateSelected.disabled = true;
  el.message.textContent = "Deactivating selected products…";
  try {
    const changed = Number(await api.rpc("bulk_deactivate_products", { p_product_ids: ids }));
    el.successTitle.textContent = "Products deactivated";
    el.successMessage.textContent = `${changed} published product${changed === 1 ? "" : "s"} removed from the public catalog.`;
    el.successNotice.hidden = false;
    await loadProducts();
  } catch (error) {
    el.message.textContent = error.message;
    el.deactivateSelected.disabled = false;
  }
});
el.deleteSelected.addEventListener("click", async () => {
  const selectedProducts = currentProducts.filter((product) =>
    selectedProductIds.has(product.id) && product.publication_status !== "ARCHIVED"
  );
  const ids = selectedProducts.map((product) => product.id);
  if (!ids.length) return;

  const productNames = selectedProducts.map((product) => product.product_name).join(", ");
  const confirmation = window.prompt(
    `Permanently delete ${ids.length} product${ids.length === 1 ? "" : "s"}?\n\n${productNames}\n\nThis removes images, colors, sizes, variants and fulfillment data. Type DELETE to continue.`
  );
  if (confirmation !== "DELETE") {
    el.message.textContent = "Delete cancelled. Type DELETE exactly to confirm permanent removal.";
    return;
  }

  el.deleteSelected.disabled = true;
  el.message.textContent = "Deleting product assets and data…";
  try {
    const encodedIds = ids.map((id) => `\"${id}\"`).join(",");
    const [images, charts] = await Promise.all([
      api.select("product_images", `select=storage_path&product_id=in.(${encodedIds})`),
      api.select("product_charts", `select=size_chart_url,color_chart_url&product_id=in.(${encodedIds})`),
    ]);
    const storagePaths = new Set((images || []).map((image) => image.storage_path).filter(Boolean));
    (charts || []).flatMap((chart) => [chart.size_chart_url, chart.color_chart_url]).filter(Boolean).forEach((url) => {
      try {
        const marker = "/storage/v1/object/public/product-assets/";
        const index = url.indexOf(marker);
        if (index >= 0) storagePaths.add(decodeURIComponent(url.slice(index + marker.length)));
      } catch {
        // External chart URLs do not belong to the product-assets bucket.
      }
    });
    if (storagePaths.size) await api.removeStorage("product-assets", [...storagePaths]);

    const deleted = Number(await api.rpc("bulk_delete_products", { p_product_ids: ids }));
    el.successTitle.textContent = "Products permanently deleted";
    el.successMessage.textContent = `${deleted} product${deleted === 1 ? "" : "s"} and all related data were removed.`;
    el.successNotice.hidden = false;
    currentProducts = currentProducts.filter((product) => !ids.includes(product.id));
    total = Math.max(0, total - deleted);
    if (page > 0 && currentProducts.length === 0) page -= 1;
    renderProducts(currentProducts);
    renderPagination();
    await loadProducts();
  } catch (error) {
    el.message.textContent = `${error.message}. Run migration 026_product_lifecycle_actions.sql in Supabase.`;
    el.deleteSelected.disabled = false;
  }
});
el.publishSelected.addEventListener("click", async () => {
  const ids = currentProducts.filter((product) =>
    selectedProductIds.has(product.id) && ["DRAFT", "UNPUBLISHED"].includes(product.publication_status)
  ).map((product) => product.id);
  if (!ids.length || !window.confirm(`Publish ${ids.length} selected product${ids.length === 1 ? "" : "s"} to the catalog?`)) return;
  el.publishSelected.disabled = true;
  el.message.textContent = "Publishing selected products…";
  try {
    const changed = Number(await api.rpc("bulk_publish_products", { p_product_ids: ids }));
    el.successTitle.textContent = "Products published";
    el.successMessage.textContent = `${changed} product${changed === 1 ? "" : "s"} added to the public catalog.`;
    el.successNotice.hidden = false;
    await loadProducts();
  } catch (error) {
    el.message.textContent = error.message;
    el.publishSelected.disabled = false;
  }
});
document.querySelector("#closeProductSuccess").addEventListener("click", () => { el.successNotice.hidden = true; });
document.querySelector("#signOutBtn").addEventListener("click", async () => {
  await api.signOut();
  window.location.replace("login.html");
});
