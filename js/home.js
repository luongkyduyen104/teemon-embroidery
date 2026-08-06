const HOME_SUPABASE_URL = "https://eppixfkfvxmjdyudzxja.supabase.co";
const HOME_SUPABASE_KEY = "sb_publishable_X1t2-Y_fpZnA2x8nWcD8Vg_9OJ7twEs";
const featuredGrid = document.querySelector("#featuredProductGrid");

const escapeHomeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]);

loadFeaturedProducts();

async function loadFeaturedProducts() {
  try {
    const response = await fetch(`${HOME_SUPABASE_URL}/rest/v1/rpc/public_featured_products`, {
      method: "POST",
      headers: { apikey: HOME_SUPABASE_KEY, "Content-Type": "application/json" },
      body: "{}",
    });
    const products = await response.json();
    if (!response.ok) throw new Error(products?.message || "Featured products could not be loaded.");
    renderFeaturedProducts(products || []);
  } catch (error) {
    featuredGrid.innerHTML = `<div class="featuredEmpty"><b>Featured products are unavailable.</b><span>${escapeHomeHtml(error.message)}</span></div>`;
  }
}

function renderFeaturedProducts(products) {
  if (!products.length) {
    featuredGrid.innerHTML = '<div class="featuredEmpty"><b>No featured products yet.</b><span>Choose up to three published products from the Products page.</span></div>';
    return;
  }
  featuredGrid.innerHTML = products.map((product, index) => `
    <a class="productCard featuredProductCard" href="product.html?slug=${encodeURIComponent(product.slug)}">
      <div class="productImage">
        <span class="productNo">${String(index + 1).padStart(2, "0")}</span>
        <span class="productBadge">Featured</span>
        ${product.thumbnail_url
          ? `<img class="featuredProductImage" src="${escapeHomeHtml(product.thumbnail_url)}" alt="${escapeHomeHtml(product.product_name)}">`
          : '<div class="featuredImagePlaceholder">No image</div>'}
      </div>
      <div class="productMeta"><div><span>${escapeHomeHtml(product.category_name)}</span><h3>${escapeHomeHtml(product.product_name)}</h3></div><strong>${Number(product.color_count)} colors · ${Number(product.size_count)} sizes</strong></div>
    </a>
  `).join("");
}
