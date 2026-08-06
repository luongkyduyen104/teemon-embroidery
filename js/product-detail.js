const SUPABASE_URL = "https://eppixfkfvxmjdyudzxja.supabase.co";
const SUPABASE_KEY = "sb_publishable_X1t2-Y_fpZnA2x8nWcD8Vg_9OJ7twEs";
const slug = new URLSearchParams(location.search).get("slug");
const detail = document.querySelector("#productDetail");
const errorBox = document.querySelector("#productError");

initialize();

async function initialize() {
  if (!slug) return showError();
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_product_detail`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
    });
    const product = await response.json();
    if (!response.ok || !product) return showError();
    renderProduct(product);
    await loadProtectedFulfillment(product.weights || []);
    await loadProtectedDesignNote();
  } catch {
    showError();
  }
}

async function loadProtectedDesignNote() {
  const api = window.teemonApi;
  const session = api?.getSession();
  if (!session?.user?.id) return;
  try {
    const result = await api.rpc("authorized_product_design_note", { p_slug: slug });
    const note = typeof result === "string" ? result : result?.design_note;
    if (!note?.trim()) return;
    const section = document.querySelector("#designNoteSection");
    document.querySelector("#designNote").textContent = note;
    section.hidden = false;
    setupExpandableText("designNote", "designNoteToggle");
  } catch (error) {
    console.warn("Design note could not be loaded for this session.", error);
  }
}

function setupExpandableText(bodyId, buttonId) {
  const body = document.querySelector(`#${bodyId}`);
  const button = document.querySelector(`#${buttonId}`);
  if (!body || !button) return;
  body.classList.remove("isExpanded");
  requestAnimationFrame(() => {
    const isOverflowing = body.scrollHeight > body.clientHeight + 2;
    body.classList.toggle("isCollapsible", isOverflowing);
    button.hidden = !isOverflowing;
    if (!isOverflowing) return;
    button.textContent = "View more";
    button.onclick = () => {
      const expanded = body.classList.toggle("isExpanded");
      button.textContent = expanded ? "Show less" : "View more";
    };
  });
}

async function loadProtectedFulfillment(publicRows) {
  const section = document.querySelector("#protectedFulfillment");
  const gate = document.querySelector("#fulfillmentGate");
  const container = document.querySelector("#productFulfillment");
  const api = window.teemonApi;
  const session = api?.getSession();

  section.hidden = false;
  if (publicRows?.length) {
    renderFulfillmentTable(publicRows, false);
  } else {
    gate.hidden = false;
    gate.className = "fulfillmentGate";
    gate.textContent = "Weight information has not been published for this product yet.";
  }

  if (!session?.user?.id) return;
  gate.hidden = false;
  gate.className = "fulfillmentGate";
  gate.textContent = "Loading staff pricing…";
  try {
    const authorizedRows = await api.rpc("authorized_product_fulfillment", { p_slug: slug });
    if (!authorizedRows?.length) return;
    renderFulfillmentTable(authorizedRows, true);
  } catch {
    gate.innerHTML = `<p>Your session is no longer valid or this account is disabled.</p>
      <a class="button primary" href="login.html?returnTo=${encodeURIComponent(`product.html?slug=${slug}`)}">Sign in again</a>`;
  }
}

function renderFulfillmentTable(rows, showPricing) {
  const gate = document.querySelector("#fulfillmentGate");
  const container = document.querySelector("#productFulfillment");
  const regions = [
    ["us", "United States"], ["canada", "Canada"], ["europe", "Europe"],
    ["uk", "United Kingdom"], ["australia", "Australia"], ["rest_of_world", "Rest of World"],
  ];
  container.innerHTML = `<table class="publicFulfillmentTable">
    <thead><tr><th>Size</th><th>Weight</th>${showPricing ? `<th>Base cost</th>${regions.map(([, label]) => `<th>${label}</th>`).join("")}` : ""}</tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td>${escapeHtml(row.size_name || row.size_code)}</td>
      <td>${row.weight_grams == null ? "—" : `${escapeHtml(row.weight_grams)} g`}</td>
      ${showPricing ? `<td>${formatMoney(row.base_cost, row.currency)}</td>${regions.map(([code]) => `<td>${formatMoney(row.shipping_estimates?.[code], row.currency)}</td>`).join("")}` : ""}
    </tr>`).join("")}</tbody>
  </table>
  <p class="fulfillmentEstimateNote">${showPricing
    ? "Base cost and estimated shipping prices in USD. Final shipping may vary by destination and order quantity."
    : "Product weight may vary slightly by production batch."}</p>`;
  gate.hidden = true;
  container.hidden = false;
}

function formatMoney(value, currency) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(Number(value));
  } catch {
    return `${value} ${currency || "USD"}`;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function renderProduct(product) {
  const descriptionBlock = document.querySelector("#productDescription");
  document.title = `${product.product_name} — TEEMON`;
  document.querySelector("#productCategory").textContent = product.category_name;
  document.querySelector("#productName").textContent = product.product_name;
  document.querySelector("#productCode").textContent = `Product code: ${product.product_code}`;
  document.querySelector("#productShortDescription").textContent = product.short_description || "";
  descriptionBlock.textContent = product.description || "";

  const images = product.images || [];
  const chartImages = [
    { url: product.size_chart_url, alt_text: "Size chart", chart: true },
    { url: product.color_chart_url, alt_text: "Color chart", chart: true },
  ].filter((item) => item.url && !item.url.toLowerCase().split("?")[0].endsWith(".pdf"));
  const galleryItems = [...images, ...chartImages];
  const mainImage = document.querySelector("#mainProductImage");
  const previousButton = document.querySelector("#previousProductImage");
  const nextButton = document.querySelector("#nextProductImage");
  const galleryCounter = document.querySelector("#galleryCounter");
  const lightbox = document.querySelector("#productLightbox");
  const lightboxImage = document.querySelector("#lightboxProductImage");
  const lightboxCounter = document.querySelector("#lightboxCounter");
  const lightboxPrevious = document.querySelector("#lightboxPreviousImage");
  const lightboxNext = document.querySelector("#lightboxNextImage");
  let currentImageIndex = 0;

  function showImage(index) {
    if (!galleryItems.length) return;
    currentImageIndex = (index + galleryItems.length) % galleryItems.length;
    const image = galleryItems[currentImageIndex];
    mainImage.src = image.url;
    mainImage.alt = image.alt_text || product.product_name;
    mainImage.classList.toggle("isChartImage", Boolean(image.chart));
    galleryCounter.textContent = `${currentImageIndex + 1} / ${galleryItems.length}`;
    if (lightbox.open) {
      lightboxImage.src = image.url;
      lightboxImage.alt = image.alt_text || product.product_name;
      lightboxImage.classList.toggle("isChartImage", Boolean(image.chart));
      lightboxCounter.textContent = `${currentImageIndex + 1} / ${galleryItems.length}`;
    }
    document.querySelectorAll("[data-image-index]").forEach((item) =>
      item.classList.toggle("active", Number(item.dataset.imageIndex) === currentImageIndex)
    );
  }

  function openLightbox(index = currentImageIndex) {
    if (!galleryItems.length) return;
    showImage(index);
    const image = galleryItems[currentImageIndex];
    lightboxImage.src = image.url;
    lightboxImage.alt = image.alt_text || product.product_name;
    lightboxImage.classList.toggle("isChartImage", Boolean(image.chart));
    lightboxCounter.textContent = `${currentImageIndex + 1} / ${galleryItems.length}`;
    lightboxPrevious.hidden = galleryItems.length < 2;
    lightboxNext.hidden = galleryItems.length < 2;
    if (!lightbox.open) lightbox.showModal();
  }

  if (galleryItems.length) {
    showImage(0);
    previousButton.hidden = galleryItems.length < 2;
    nextButton.hidden = galleryItems.length < 2;
  } else {
    mainImage.hidden = true;
    previousButton.hidden = true;
    nextButton.hidden = true;
  }

  document.querySelector("#productThumbnails").innerHTML = galleryItems.map((image, index) =>
    `<button type="button" class="${index === 0 ? "active" : ""}" data-image-index="${index}" title="${escapeHtml(image.alt_text || product.product_name)}"><img class="${image.chart ? "isChartImage" : ""}" src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt_text || product.product_name)}"></button>`
  ).join("");
  document.querySelector("#productColors").innerHTML = (product.colors || []).map((color) =>
    `<span class="publicSwatch">${escapeHtml(color.name)}</span>`
  ).join("") || "<span>Not specified</span>";
  document.querySelector("#productSizes").innerHTML = (product.sizes || []).map((size) =>
    `<span class="publicSize">${escapeHtml(size.name)}</span>`
  ).join("") || "<span>Not specified</span>";
  document.querySelector("#productCharts").hidden = true;
  detail.hidden = false;
  setupExpandableText("productDescription", "productDescriptionToggle");

  document.querySelector("#productThumbnails").addEventListener("click", (event) => {
    const button = event.target.closest("[data-image-index]");
    if (button) showImage(Number(button.dataset.imageIndex));
  });
  previousButton.addEventListener("click", () => showImage(currentImageIndex - 1));
  nextButton.addEventListener("click", () => showImage(currentImageIndex + 1));
  document.addEventListener("keydown", (event) => {
    if (galleryItems.length < 2) return;
    if (event.key === "ArrowLeft") showImage(currentImageIndex - 1);
    if (event.key === "ArrowRight") showImage(currentImageIndex + 1);
  });
}

function renderCharts(product) {
  const charts = [
    ["Size chart", product.size_chart_url],
    ["Color chart", product.color_chart_url],
  ].filter(([, url]) => url);
  const container = document.querySelector("#productCharts");
  if (!charts.length) return;
  container.innerHTML = charts.map(([title, url]) => {
    const safeUrl = escapeHtml(url);
    let isPdf = false;
    try { isPdf = new URL(url).pathname.toLowerCase().endsWith(".pdf"); } catch {}
    return `<article class="publicChartCard">
      <h2>${title}</h2>
      ${isPdf
        ? `<iframe src="${safeUrl}" title="${title}" loading="lazy"></iframe>`
        : `<img src="${safeUrl}" alt="${title}" loading="lazy">`}
      <a href="${safeUrl}" target="_blank" rel="noopener">Open full ${title.toLowerCase()} ↗</a>
    </article>`;
  }).join("");
  container.hidden = false;
}

function showError() {
  detail.hidden = true;
  errorBox.hidden = false;
}
