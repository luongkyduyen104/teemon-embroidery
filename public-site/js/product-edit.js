const api = window.teemonApi;
const productId = new URLSearchParams(window.location.search).get("id");
let productVersion = null;
let publicationStatus = null;
let isReady = false;
let existingImages = [];
let pendingImageFiles = [];
const MAX_PRODUCT_IMAGES = 7;
const PRODUCT_IMAGE_SIZE = 1600;
const CHART_MAX_EDGE = 2200;
const WEBP_QUALITY = 0.84;
let availableSizes = [];
let fulfillmentBySize = new Map();
const shippingRegions = [
  ["us", "United States"],
  ["canada", "Canada"],
  ["europe", "Europe"],
  ["uk", "United Kingdom"],
  ["australia", "Australia"],
  ["rest_of_world", "Rest of World"],
];
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
  imageInput: document.querySelector("#productImages"),
  imageGrid: document.querySelector("#imagePreviewGrid"),
  imageCount: document.querySelector("#imageCount"),
  sizeChartUrl: document.querySelector("#sizeChartUrl"),
  sizeChartFile: document.querySelector("#sizeChartFile"),
  colorChartUrl: document.querySelector("#colorChartUrl"),
  colorChartFile: document.querySelector("#colorChartFile"),
  colors: document.querySelector("#colorOptions"),
  sizes: document.querySelector("#sizeOptions"),
  newColorName: document.querySelector("#newColorName"),
  addColor: document.querySelector("#addColorOption"),
  newSizeName: document.querySelector("#newSizeName"),
  addSize: document.querySelector("#addSizeOption"),
  fulfillmentRows: document.querySelector("#fulfillmentRows"),
  message: document.querySelector("#productFormMessage"),
  actionStatus: document.querySelector("#editorActionStatus"),
  save: document.querySelector("#saveProductButton"),
  badge: document.querySelector("#productStatusBadge"),
  publicationButton: document.querySelector("#publicationButton"),
};

initialize();

async function initialize() {
  try {
    const session = api?.getSession();
    if (!session?.user?.id) return window.location.replace("login.html");
    if (!productId) return window.location.replace("products.html");
    const profiles = await api.select(
      "profiles",
      `select=full_name,role,is_root_admin,active,must_change_password&id=eq.${encodeURIComponent(session.user.id)}`
    );
    const profile = profiles?.[0];
    if (!profile?.active || profile.role !== "admin") return window.location.replace("products.html");
    if (profile.must_change_password) return window.location.replace("change-password.html");

    const fullName = profile.full_name || session.user.email;
    document.querySelector("#adminName").textContent = fullName;
    document.querySelector("#adminAvatar").textContent = initials(fullName);
    document.querySelector("#adminRole").textContent = profile.is_root_admin ? "Root Admin" : "Admin";
    await loadProductAndOptions();
    isReady = true;
  } catch (error) {
    showError(error.message);
    el.save.disabled = true;
  }
}

async function loadProductAndOptions() {
  const [products, colors, sizes, selectedColors, selectedSizes, images, charts, fulfillment] = await Promise.all([
    api.select("products", `select=*,categories(code)&id=eq.${encodeURIComponent(productId)}`),
    api.select("colors", "select=id,code,name&is_active=eq.true&order=name"),
    api.select("sizes", "select=id,code,name,display_order&is_active=eq.true&order=display_order,name"),
    api.select("product_colors", `select=color_id&product_id=eq.${encodeURIComponent(productId)}`),
    api.select("product_sizes", `select=size_id&product_id=eq.${encodeURIComponent(productId)}`),
    api.select("product_images", `select=id,storage_path,image_url,alt_text,is_thumbnail,display_order&product_id=eq.${encodeURIComponent(productId)}&order=display_order`),
    api.select("product_charts", `select=size_chart_url,color_chart_url&product_id=eq.${encodeURIComponent(productId)}`),
    api.rpc("admin_product_fulfillment", { p_product_id: productId }),
  ]);
  const product = products?.[0];
  if (!product) throw new Error("Product not found.");
  const colorIds = new Set(selectedColors.map((item) => item.color_id));
  const sizeIds = new Set(selectedSizes.map((item) => item.size_id));
  availableSizes = sizes;
  fulfillmentBySize = new Map((fulfillment || []).map((item) => [item.size_id, item]));
  el.colors.innerHTML = colors.map((color) => optionColor(color, colorIds.has(color.id))).join("");
  el.sizes.innerHTML = sizes.map((size) => optionSize(size, sizeIds.has(size.id))).join("");
  renderFulfillmentRows();
  productVersion = product.version;
  el.code.value = product.product_code;
  el.name.value = product.product_name;
  el.slug.value = product.slug;
  el.category.value = product.categories?.code || "";
  el.shortDescription.value = product.short_description || "";
  el.keywords.value = (product.keywords || []).join(", ");
  el.shortCount.textContent = el.shortDescription.value.length;
  el.description.value = product.description;
  el.designNote.value = product.design_note || "";
  existingImages = images || [];
  el.sizeChartUrl.value = charts?.[0]?.size_chart_url || "";
  el.colorChartUrl.value = charts?.[0]?.color_chart_url || "";
  renderImages();
  el.badge.textContent = product.publication_status;
  el.badge.className = `statusBadge status-${product.publication_status.toLowerCase()}`;
  document.querySelector("#editorTitle").textContent = product.product_name;
  publicationStatus = product.publication_status;
  updatePublicationButton();
  if (product.publication_status === "ARCHIVED") {
    el.message.textContent = "Archived products are read-only until restored.";
    [...el.form.elements].forEach((control) => { control.disabled = true; });
  }
}

function updatePublicationButton() {
  el.publicationButton.hidden = publicationStatus === "ARCHIVED";
  if (publicationStatus === "PUBLISHED") {
    el.publicationButton.textContent = "Deactivate";
    el.publicationButton.classList.add("dangerButton");
  } else {
    el.publicationButton.textContent = publicationStatus === "UNPUBLISHED" ? "Activate" : "Publish";
    el.publicationButton.classList.remove("dangerButton");
  }
}

function renderImages() {
  const pending = pendingImageFiles;
  const existingCards = existingImages.map((image) => `
    <article class="imageCard">
      <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(image.alt_text || "Product image")}">
      <div class="imageCardFooter">
        <span class="${image.is_thumbnail ? "thumbnailLabel" : ""}">${image.is_thumbnail ? "Thumbnail" : "Saved"}</span>
        <button class="removeImage" type="button" data-delete-image="${escapeHtml(image.id)}">Remove</button>
      </div>
    </article>
  `).join("");
  const pendingCards = pending.map((file, index) => `
    <article class="imageCard">
      <img src="${URL.createObjectURL(file)}" alt="Pending upload">
      <div class="imageCardFooter">
        <span>${existingImages.length === 0 && index === 0 ? "New thumbnail" : "Ready to upload"}</span>
        <button class="removeImage" type="button" data-remove-pending="${index}">Remove</button>
      </div>
    </article>
  `).join("");
  el.imageGrid.innerHTML = existingCards + pendingCards || '<span class="optionLoading">No product images yet.</span>';
  el.imageCount.textContent = `${existingImages.length + pending.length}/${MAX_PRODUCT_IMAGES} images`;
}

function validateFiles(files, allowedTypes, label) {
  for (const file of files) {
    if (!allowedTypes.includes(file.type)) throw new Error(`${label}: ${file.name} has an unsupported file type.`);
    if (file.size > 10 * 1024 * 1024) throw new Error(`${label}: ${file.name} is larger than 10 MB.`);
  }
}

function storagePath(folder, file) {
  const extension = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${productId}/${folder}/${crypto.randomUUID()}.${extension}`;
}

async function loadImageSource(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return createImageBitmap(file);
    }
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}.`));
    };
    image.src = url;
  });
}

function canvasToWebp(canvas, quality = WEBP_QUALITY) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("This browser could not optimize the image.")),
    "image/webp",
    quality
  ));
}

async function optimizeProductImage(file) {
  const source = await loadImageSource(file);
  const canvas = document.createElement("canvas");
  canvas.width = PRODUCT_IMAGE_SIZE;
  canvas.height = PRODUCT_IMAGE_SIZE;
  const context = canvas.getContext("2d", { alpha: false });
  // Preserve the complete image. Any unused space stays neutral grey.
  context.fillStyle = "#e5e7e2";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, Math.round((canvas.width - width) / 2), Math.round((canvas.height - height) / 2), width, height);
  source.close?.();
  const blob = await canvasToWebp(canvas);
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "product-image";
  return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
}

async function optimizeChartImage(file) {
  if (file.type === "application/pdf") return file;
  const source = await loadImageSource(file);
  const scale = Math.min(CHART_MAX_EDGE / Math.max(source.width, source.height), 1);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  source.close?.();
  const blob = await canvasToWebp(canvas, 0.9);
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "chart";
  return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
}

async function uploadProductMedia() {
  const imageFiles = [...pendingImageFiles];
  validateFiles(imageFiles, ["image/jpeg", "image/png", "image/webp"], "Product image");
  if (existingImages.length + imageFiles.length > MAX_PRODUCT_IMAGES) throw new Error(`A product can contain at most ${MAX_PRODUCT_IMAGES} images.`);
  for (let index = 0; index < imageFiles.length; index += 1) {
    const file = imageFiles[index];
    el.message.textContent = `Optimizing and uploading image ${index + 1} of ${imageFiles.length}...`;
    el.save.textContent = `Uploading ${index + 1}/${imageFiles.length}`;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const optimizedFile = await optimizeProductImage(file);
    const uploaded = await api.upload("product-assets", storagePath("images", optimizedFile), optimizedFile);
    try {
      await api.rpc("add_product_image", {
        p_product_id: productId,
        p_storage_path: uploaded.path,
        p_image_url: uploaded.publicUrl,
        p_alt_text: `${el.name.value.trim()} product image`,
      });
    } catch (error) {
      await api.removeStorage("product-assets", [uploaded.path]).catch(() => {});
      throw error;
    }
  }
  pendingImageFiles = [];
  el.imageInput.value = "";

  let sizeChartUrl = el.sizeChartUrl.value.trim();
  let colorChartUrl = el.colorChartUrl.value.trim();
  const chartFiles = [el.sizeChartFile.files[0], el.colorChartFile.files[0]].filter(Boolean);
  validateFiles(chartFiles, ["image/jpeg", "image/png", "image/webp", "application/pdf"], "Chart");
  if (el.sizeChartFile.files[0]) {
    el.message.textContent = "Optimizing and uploading size chart...";
    const optimizedSizeChart = await optimizeChartImage(el.sizeChartFile.files[0]);
    sizeChartUrl = (await api.upload("product-assets", storagePath("charts", optimizedSizeChart), optimizedSizeChart)).publicUrl;
  }
  if (el.colorChartFile.files[0]) {
    el.message.textContent = "Optimizing and uploading color chart...";
    const optimizedColorChart = await optimizeChartImage(el.colorChartFile.files[0]);
    colorChartUrl = (await api.upload("product-assets", storagePath("charts", optimizedColorChart), optimizedColorChart)).publicUrl;
  }
  await api.rpc("set_product_chart_urls", {
    p_product_id: productId,
    p_size_chart_url: sizeChartUrl || null,
    p_color_chart_url: colorChartUrl || null,
  });
}

function optionColor(color, checked) {
  return `<label class="optionChoice"><input type="checkbox" name="colorId" value="${escapeHtml(color.id)}" ${checked ? "checked" : ""}><span>${escapeHtml(color.name)}</span></label>`;
}

function optionSize(size, checked) {
  return `<label class="optionChoice"><input type="checkbox" name="sizeId" value="${escapeHtml(size.id)}" ${checked ? "checked" : ""}><span>${escapeHtml(size.name)}</span></label>`;
}

function selectedValues(name) {
  return [...el.form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function keywordValues() {
  return [...new Set(el.keywords.value.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
}

async function addInlineOption(type) {
  const input = type === "color" ? el.newColorName : el.newSizeName;
  const button = type === "color" ? el.addColor : el.addSize;
  const container = type === "color" ? el.colors : el.sizes;
  const inputName = `${type}Id`;
  const name = input.value.trim();
  if (!name) return showError(`Enter a ${type === "color" ? "color or pattern" : "size"} name.`);

  button.disabled = true;
  el.message.classList.remove("isError");
  el.message.textContent = `Adding ${type}...`;
  try {
    const option = await api.rpc("create_inline_product_option", { p_type: type, p_name: name });
    let checkbox = container.querySelector(`input[name="${inputName}"][value="${option.id}"]`);
    if (!checkbox) {
      container.insertAdjacentHTML("beforeend", type === "color"
        ? optionColor(option, true)
        : optionSize({ ...option, code: option.name }, true));
      checkbox = container.querySelector(`input[name="${inputName}"][value="${option.id}"]`);
    }
    checkbox.checked = true;
    if (type === "size" && !availableSizes.some((size) => size.id === option.id)) {
      availableSizes.push({ id: option.id, name: option.name, code: option.name });
      renderFulfillmentRows();
    }
    input.value = "";
    el.message.textContent = `${name} added and selected. Save changes to apply it to this product.`;
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
}

function captureFulfillmentRows() {
  el.fulfillmentRows.querySelectorAll("[data-fulfillment-size]").forEach((row) => {
    fulfillmentBySize.set(row.dataset.fulfillmentSize, {
      size_id: row.dataset.fulfillmentSize,
      weight_grams: row.querySelector("[data-field='weight']").value,
      base_cost: row.querySelector("[data-field='base-cost']").value,
      shipping_estimates: Object.fromEntries(shippingRegions.map(([code]) => [
        code,
        row.querySelector(`[data-region="${code}"]`).value,
      ])),
      currency: "USD",
    });
  });
}

function renderFulfillmentRows() {
  captureFulfillmentRows();
  const selected = new Set(selectedValues("sizeId"));
  const rows = availableSizes.filter((size) => selected.has(size.id));
  el.fulfillmentRows.innerHTML = rows.map((size) => {
    const value = fulfillmentBySize.get(size.id) || {};
    const rates = value.shipping_estimates || {};
    return `<tr data-fulfillment-size="${escapeHtml(size.id)}">
      <td><b>${escapeHtml(size.name)}</b><br><small>${escapeHtml(size.code)}</small></td>
      <td><input data-field="weight" type="number" min="0.01" step="0.01" value="${escapeHtml(value.weight_grams ?? "")}" aria-label="${escapeHtml(size.name)} weight in grams"></td>
      <td><input data-field="base-cost" type="number" min="0" step="0.01" value="${escapeHtml(value.base_cost ?? "")}" aria-label="${escapeHtml(size.name)} base cost in USD"></td>
      ${shippingRegions.map(([code, label]) => `<td><input data-region="${code}" type="number" min="0" step="0.01" value="${escapeHtml(rates[code] ?? "")}" aria-label="${escapeHtml(size.name)} ${label} shipping price in USD"></td>`).join("")}
    </tr>`;
  }).join("") || '<tr><td colspan="9">Select at least one size.</td></tr>';
}

function fulfillmentRowsForSave() {
  captureFulfillmentRows();
  return selectedValues("sizeId").map((sizeId) => {
    const value = fulfillmentBySize.get(sizeId) || {};
    const rates = Object.fromEntries(shippingRegions.map(([code]) => {
      const rawValue = value.shipping_estimates?.[code];
      return [code, rawValue === "" || rawValue == null ? null : Number(rawValue)];
    }));
    return {
      size_id: sizeId,
      weight_grams: value.weight_grams === "" || value.weight_grams == null ? null : Number(value.weight_grams),
      base_cost: value.base_cost === "" || value.base_cost == null ? null : Number(value.base_cost),
      shipping_estimates: rates,
      currency: "USD",
    };
  });
}

function initials(value) {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function showError(message) {
  el.message.classList.add("isError");
  el.message.textContent = message;
}

const messageObserver = new MutationObserver(() => {
  el.actionStatus.textContent = el.message.textContent;
  el.actionStatus.classList.toggle("isError", el.message.classList.contains("isError"));
});
messageObserver.observe(el.message, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });

el.shortDescription.addEventListener("input", () => {
  el.shortCount.textContent = el.shortDescription.value.length;
});

el.imageInput.addEventListener("change", () => {
  try {
    const selectedFiles = [...el.imageInput.files];
    validateFiles(selectedFiles, ["image/jpeg", "image/png", "image/webp"], "Product image");
    if (existingImages.length + pendingImageFiles.length + selectedFiles.length > MAX_PRODUCT_IMAGES) {
      throw new Error(`You can add ${Math.max(0, MAX_PRODUCT_IMAGES - existingImages.length - pendingImageFiles.length)} more image(s). A product can contain at most ${MAX_PRODUCT_IMAGES} images.`);
    }
    pendingImageFiles.push(...selectedFiles);
    el.imageInput.value = "";
    renderImages();
    el.message.textContent = "";
  } catch (error) {
    el.imageInput.value = "";
    showError(error.message);
    renderImages();
  }
});

el.imageGrid.addEventListener("click", async (event) => {
  const pendingButton = event.target.closest("[data-remove-pending]");
  if (pendingButton) {
    pendingImageFiles.splice(Number(pendingButton.dataset.removePending), 1);
    renderImages();
    return;
  }
  const button = event.target.closest("[data-delete-image]");
  if (!button || !window.confirm("Remove this product image?")) return;
  button.disabled = true;
  try {
    const path = await api.rpc("delete_product_image", { p_image_id: button.dataset.deleteImage });
    await api.removeStorage("product-assets", [path]);
    existingImages = existingImages.filter((image) => image.id !== button.dataset.deleteImage);
    renderImages();
  } catch (error) {
    showError(error.message);
    button.disabled = false;
  }
});

el.sizes.addEventListener("change", (event) => {
  if (event.target.matches("input[name='sizeId']")) renderFulfillmentRows();
});

el.addColor.addEventListener("click", () => addInlineOption("color"));
el.addSize.addEventListener("click", () => addInlineOption("size"));

async function saveBeforePublication() {
  if (!isReady || !el.form.reportValidity()) return false;
  const colorIds = selectedValues("colorId");
  const sizeIds = selectedValues("sizeId");
  if (!colorIds.length || !sizeIds.length) {
    showError("Select at least one color and one size.");
    return false;
  }
  el.message.classList.remove("isError");
  el.message.textContent = "Saving product and fulfillment prices first...";
  const data = await api.rpc("update_product_with_keywords", {
    p_product_id: productId,
    p_expected_version: productVersion,
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
  const updated = Array.isArray(data) ? data[0] : data;
  if (!updated?.id) throw new Error("Supabase did not return the updated product.");
  productVersion = updated.version;
  await api.rpc("save_product_design_note", {
    p_product_id: productId,
    p_design_note: el.designNote.value.trim() || null,
  });
  const rows = fulfillmentRowsForSave();
  const result = await api.rpc("save_product_fulfillment_v2", { p_product_id: productId, p_rows: rows });
  if (Number(result?.saved_rows) !== rows.length) throw new Error("Supabase did not confirm every fulfillment row was saved.");
  await uploadProductMedia();
  return true;
}

el.publicationButton.addEventListener("click", async () => {
  const nextStatus = publicationStatus === "PUBLISHED" ? "UNPUBLISHED" : "PUBLISHED";
  const action = nextStatus === "PUBLISHED" ? (publicationStatus === "UNPUBLISHED" ? "activate" : "publish") : "deactivate";
  if (!window.confirm(`Are you sure you want to ${action} this product?`)) return;
  el.publicationButton.disabled = true;
  el.message.classList.remove("isError");
  el.message.textContent = `${action[0].toUpperCase()}${action.slice(1)}ing product…`;
  try {
    if (!await saveBeforePublication()) {
      el.publicationButton.disabled = false;
      return;
    }
    const data = await api.rpc("set_product_publication_status", {
      p_product_id: productId,
      p_expected_version: productVersion,
      p_new_status: nextStatus,
    });
    const updated = Array.isArray(data) ? data[0] : data;
    productVersion = updated.version;
    publicationStatus = updated.publication_status;
    window.location.assign(`products.html?statusChanged=${encodeURIComponent(publicationStatus)}`);
  } catch (error) {
    showError(error.message);
    el.publicationButton.disabled = false;
  }
});

el.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isReady) return;
  const colorIds = selectedValues("colorId");
  const sizeIds = selectedValues("sizeId");
  if (!colorIds.length || !sizeIds.length) {
    showError("Select at least one color and one size.");
    return;
  }
  el.message.classList.remove("isError");
  el.save.disabled = true;
  el.save.textContent = "Saving...";
  el.message.textContent = "Saving changes…";
  try {
    const data = await api.rpc("update_product_with_keywords", {
      p_product_id: productId,
      p_expected_version: productVersion,
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
    const updated = Array.isArray(data) ? data[0] : data;
    if (!updated?.id) throw new Error("Supabase did not return the updated product.");
    productVersion = updated.version;
    await api.rpc("save_product_design_note", {
      p_product_id: productId,
      p_design_note: el.designNote.value.trim() || null,
    });
    el.message.textContent = "Saving fulfillment data…";
    const fulfillmentRows = fulfillmentRowsForSave();
    const fulfillmentResult = await api.rpc("save_product_fulfillment_v2", {
      p_product_id: productId,
      p_rows: fulfillmentRows,
    });
    if (Number(fulfillmentResult?.saved_rows) !== fulfillmentRows.length) {
      throw new Error("Supabase did not confirm every fulfillment row was saved.");
    }
    el.message.textContent = "Uploading product media…";
    await uploadProductMedia();
    window.location.assign(`products.html?updated=${encodeURIComponent(updated.id)}`);
  } catch (error) {
    showError(error.message);
  } finally {
    el.save.disabled = false;
    el.save.textContent = "Save changes";
  }
});

document.querySelector("#signOutBtn").addEventListener("click", async () => {
  await api.signOut();
  window.location.replace("login.html");
});
