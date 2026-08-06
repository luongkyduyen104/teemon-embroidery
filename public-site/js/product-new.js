const api = window.teemonApi;
const el = {
  form: document.querySelector("#productForm"),
  code: document.querySelector("#productCode"),
  name: document.querySelector("#productName"),
  slug: document.querySelector("#productSlug"),
  category: document.querySelector("#categoryId"),
  shortDescription: document.querySelector("#shortDescription"),
  shortCount: document.querySelector("#shortDescriptionCount"),
  keywords: document.querySelector("#productKeywords"),
  description: document.querySelector("#description"),
  designNote: document.querySelector("#designNote"),
  colors: document.querySelector("#colorOptions"),
  sizes: document.querySelector("#sizeOptions"),
  newColorName: document.querySelector("#newColorName"),
  addColor: document.querySelector("#addColorOption"),
  newSizeName: document.querySelector("#newSizeName"),
  addSize: document.querySelector("#addSizeOption"),
  message: document.querySelector("#productFormMessage"),
  save: document.querySelector("#saveProductButton"),
};

let isReady = false;
el.form.addEventListener("submit", handleSaveDraft);

el.form.addEventListener("invalid", (event) => {
  el.message.classList.add("isError");
  el.message.textContent = "Draft not saved. Complete Product Code, Category, Product Name, URL slug and Description.";
  event.target.classList.add("fieldInvalid");
}, true);
el.form.addEventListener("input", (event) => {
  event.target.classList.remove("fieldInvalid");
  if (!el.form.querySelector(":invalid")) {
    el.message.classList.remove("isError");
    el.message.textContent = "";
  }
});
el.shortDescription.addEventListener("input", () => {
  el.shortCount.textContent = el.shortDescription.value.length;
});

let slugEdited = false;
el.slug.addEventListener("input", () => { slugEdited = true; });
el.name.addEventListener("input", () => {
  if (!slugEdited) el.slug.value = createSlug(el.name.value);
});

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
    const profile = rows?.[0];
    if (!profile?.active || profile.role !== "admin") {
      window.location.replace("products.html");
      return;
    }
    if (profile.must_change_password) {
      window.location.replace("change-password.html");
      return;
    }
    const fullName = profile.full_name || session.user.email;
    document.querySelector("#adminName").textContent = fullName;
    document.querySelector("#adminAvatar").textContent = fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    document.querySelector("#adminRole").textContent = profile.is_root_admin ? "Root Admin" : "Admin";
    await loadOptions();
    isReady = true;
  } catch (error) {
    showError(`Product form could not connect to Supabase: ${error.message}`);
    el.save.disabled = true;
  }
}

function createSlug(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function showError(message) {
  el.message.classList.add("isError");
  el.message.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

async function loadOptions() {
  const selectedColors = new Set(selectedValues("colorId"));
  const selectedSizes = new Set(selectedValues("sizeId"));
  const [colors, sizes] = await Promise.all([
    api.select("colors", "select=id,code,name&is_active=eq.true&order=name"),
    api.select("sizes", "select=id,code,name,display_order&is_active=eq.true&order=display_order,name"),
  ]);
  el.colors.innerHTML = colors.length ? colors.map((color) => `
    <label class="optionChoice">
      <input type="checkbox" name="colorId" value="${escapeHtml(color.id)}" ${selectedColors.has(color.id) ? "checked" : ""}>
      <span>${escapeHtml(color.name)}</span>
    </label>
  `).join("") : '<span class="optionLoading">No colors or patterns yet. Create one below.</span>';
  el.sizes.innerHTML = sizes.length ? sizes.map((size) => `
    <label class="optionChoice">
      <input type="checkbox" name="sizeId" value="${escapeHtml(size.id)}" ${selectedSizes.has(size.id) ? "checked" : ""}>
      <span>${escapeHtml(size.name)}</span>
    </label>
  `).join("") : '<span class="optionLoading">No sizes yet. Create one below.</span>';
}

async function addInlineOption(type) {
  const input = type === "color" ? el.newColorName : el.newSizeName;
  const button = type === "color" ? el.addColor : el.addSize;
  const name = input.value.trim();
  if (!name) return showError(`Enter a ${type === "color" ? "color or pattern" : "size"} name.`);
  button.disabled = true;
  el.message.classList.remove("isError");
  el.message.textContent = `Adding ${type}…`;
  try {
    const option = await api.rpc("create_inline_product_option", { p_type: type, p_name: name });
    await loadOptions();
    el.form.querySelector(`input[name="${type}Id"][value="${option.id}"]`)?.click();
    input.value = "";
    el.message.textContent = `${name} added and selected.`;
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
}

function selectedValues(name) {
  return [...el.form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function keywordValues() {
  return [...new Set(el.keywords.value.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
}

async function handleSaveDraft(event) {
  event.preventDefault();
  if (!isReady) {
    showError("The secure connection is still loading. Wait a moment and try again.");
    return;
  }
  const colorIds = selectedValues("colorId");
  const sizeIds = selectedValues("sizeId");
  if (!colorIds.length || !sizeIds.length) {
    showError("Select at least one color and one size.");
    return;
  }
  el.message.classList.remove("isError");
  el.save.disabled = true;
  el.message.textContent = "Saving Draft…";
  try {
    const data = await api.rpc("create_draft_product_with_keywords", {
      p_product_code: el.code.value.trim(),
      p_product_name: el.name.value.trim(),
      p_slug: el.slug.value.trim(),
      p_category_code: el.category.value,
      p_short_description: el.shortDescription.value.trim() || null,
      p_description: el.description.value.trim(),
      p_keywords: keywordValues(),
      p_color_ids: colorIds,
      p_size_ids: sizeIds,
    });
    const product = Array.isArray(data) ? data[0] : data;
    if (!product?.id) throw new Error("Supabase did not return the new product.");
    await api.rpc("save_product_design_note", {
      p_product_id: product.id,
      p_design_note: el.designNote.value.trim() || null,
    });
    window.location.assign(`products.html?created=${encodeURIComponent(product.id)}`);
  } catch (error) {
    showError(error.message);
    el.save.disabled = false;
  }
}

document.querySelector("#signOutBtn").addEventListener("click", async () => {
  await api.signOut();
  window.location.replace("login.html");
});
el.addColor.addEventListener("click", () => addInlineOption("color"));
el.addSize.addEventListener("click", () => addInlineOption("size"));
