const SUPABASE_URL = "https://eppixfkfvxmjdyudzxja.supabase.co";
const SUPABASE_KEY = "sb_publishable_X1t2-Y_fpZnA2x8nWcD8Vg_9OJ7twEs";

let products = [];

const PAGE_SIZE = 20;
let currentPage = 1;

const search = document.querySelector("#search");
const clearSearch = document.querySelector("#clearSearch");
const grid = document.querySelector("#catalogGrid");
const count = document.querySelector("#resultCount");
const empty = document.querySelector("#emptyState");
const sort = document.querySelector("#sort");
const categoryFilters = document.querySelector("#categoryFilters");
const pagination = document.querySelector("#catalogPagination");
const pageNumber = document.querySelector("#pageNumber");
const totalPagesLabel = document.querySelector("#totalPages");
const pageButtons = document.querySelector("#catalogPageButtons");
const previousPage = document.querySelector("#previousPage");
const nextPage = document.querySelector("#nextPage");
const resetFilters = document.querySelector("#resetFilters");
const catalogBody = document.querySelector(".catalogBody");

initialize();

async function initialize() {
  try {
    const requestOptions = {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: "{}"
    };

    const [catalogResponse, featuredResponse] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/rpc/public_catalog_products_searchable`,
        requestOptions
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/rpc/public_featured_products`,
        requestOptions
      )
    ]);

    const [data, featuredProducts] = await Promise.all([
      catalogResponse.json(),
      featuredResponse.json()
    ]);

    if (!catalogResponse.ok) {
      throw new Error(data?.message || "Catalog could not be loaded.");
    }

    if (!featuredResponse.ok) {
      throw new Error(
        featuredProducts?.message || "Best sellers could not be loaded."
      );
    }

    const featuredIds = new Set(
      (featuredProducts || []).map((product) => product.id)
    );

    products = (data || []).map((product) => ({
      ...product,
      is_featured: featuredIds.has(product.id)
    }));

    renderCategoryFilters();
    applyInitialCategory();
    updateClearSearchButton();
    render();
  } catch (error) {
    count.textContent = "Catalog unavailable";
    grid.hidden = true;
    pagination.hidden = true;
    empty.hidden = false;

    const emptyTitle = empty.querySelector("h2");
    const emptyText = empty.querySelector("p");

    if (emptyTitle) {
      emptyTitle.textContent = "Unable to load products.";
    }

    if (emptyText) {
      emptyText.textContent = error.message;
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
  );
}

function selectedCategory() {
  return (
    document.querySelector('input[name="cat"]:checked')?.value ||
    "All products"
  );
}

function updateClearSearchButton() {
  if (!search || !clearSearch) {
    return;
  }

  const hasSearchContent = search.value.trim().length > 0;

  clearSearch.hidden = !hasSearchContent;
  clearSearch.textContent = "Clear";
}

function renderCategoryFilters() {
  const totals = products.reduce((result, product) => {
    const categoryName = product.category_name || "Uncategorized";

    result[categoryName] = (result[categoryName] || 0) + 1;

    return result;
  }, {});

  categoryFilters.innerHTML = `
    <label>
      <input
        type="radio"
        name="cat"
        value="All products"
        checked
      >
      All products
      <span>${products.length}</span>
    </label>

    ${Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([name, total]) => `
          <label>
            <input
              type="radio"
              name="cat"
              value="${escapeHtml(name)}"
            >
            ${escapeHtml(name)}
            <span>${total}</span>
          </label>
        `
      )
      .join("")}
  `;

  categoryFilters
    .querySelectorAll('input[name="cat"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        currentPage = 1;
        render();
      });
    });
}

function getFilteredProducts() {
  const query = search.value.trim().toLowerCase();
  const searchTerms = query.split(/\s+/).filter(Boolean);
  const category = selectedCategory();

  let list = products.filter((product) => {
    const searchableText = [
      product.product_name,
      product.product_code,
      product.category_name,
      ...(Array.isArray(product.keywords) ? product.keywords : [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchTerms.every((term) =>
      searchableText.includes(term)
    );

    const matchesCategory =
      category === "All products" ||
      product.category_name === category;

    return matchesSearch && matchesCategory;
  });

  list = [...list].sort((a, b) => {
    const featuredOrder =
      Number(Boolean(b.is_featured)) -
      Number(Boolean(a.is_featured));

    if (featuredOrder !== 0) {
      return featuredOrder;
    }

    if (sort.value === "name") {
      return String(a.product_name || "").localeCompare(
        String(b.product_name || "")
      );
    }

    return (
      new Date(b.published_at || 0).getTime() -
      new Date(a.published_at || 0).getTime()
    );
  });

  return list;
}

function render() {
  const list = getFilteredProducts();

  const totalPages = Math.max(
    1,
    Math.ceil(list.length / PAGE_SIZE)
  );

  currentPage = Math.min(currentPage, totalPages);

  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const visibleProducts = list.slice(
    pageStart,
    pageStart + PAGE_SIZE
  );

  count.textContent =
    `${list.length} product${list.length === 1 ? "" : "s"}`;

  grid.hidden = list.length === 0;
  empty.hidden = list.length > 0;
  pagination.hidden = list.length === 0;

  if (list.length === 0) {
    const emptyTitle = empty.querySelector("h2");
    const emptyText = empty.querySelector("p");

    if (emptyTitle) {
      emptyTitle.textContent = "No matching products.";
    }

    if (emptyText) {
      emptyText.textContent =
        "Try a different keyword or reset the filters.";
    }

    pageNumber.textContent = "1";
    totalPagesLabel.textContent = "1";
    pageButtons.innerHTML = "";
    previousPage.disabled = true;
    nextPage.disabled = true;

    updateClearSearchButton();
    return;
  }

  grid.innerHTML = visibleProducts
    .map(
      (product, index) => `
        <a
          class="catalogProductLink"
          href="product.html?slug=${encodeURIComponent(product.slug || "")}"
          aria-label="View ${escapeHtml(product.product_name)}"
        >
          <article>
            <div class="catalogImage">
              <span>
                ${String(pageStart + index + 1).padStart(2, "0")}
              </span>

              ${
                product.is_featured && pageStart + index < 3
                  ? '<b class="bestSellerBadge">BEST SELLER</b>'
                  : ""
              }

              ${
                product.thumbnail_url
                  ? `
                    <img
                      class="catalogRealImage"
                      src="${escapeHtml(product.thumbnail_url)}"
                      alt="${escapeHtml(product.product_name)}"
                    >
                  `
                  : `
                    <div class="catalogImagePlaceholder">
                      No image
                    </div>
                  `
              }
            </div>

            <div class="catalogMeta">
              <span>
                ${escapeHtml(product.category_name)}
              </span>

              <h3>
                ${escapeHtml(product.product_name)}
              </h3>

              <p>
                ${Number(product.color_count || 0)}
                color${Number(product.color_count) === 1 ? "" : "s"}
                ·
                ${Number(product.size_count || 0)}
                size${Number(product.size_count) === 1 ? "" : "s"}
              </p>

              <p class="catalogProductCode">
                <span>
                  Code: ${escapeHtml(product.product_code)}
                </span>

                <button
                  type="button"
                  class="copyProductCode"
                  data-code="${escapeHtml(product.product_code)}"
                  aria-label="Copy product code ${escapeHtml(
                    product.product_code
                  )}"
                >
                  Copy
                </button>
              </p>

              <b>● AVAILABLE</b>
            </div>
          </article>
        </a>
      `
    )
    .join("");

  pageNumber.textContent = currentPage;
  totalPagesLabel.textContent = totalPages;

  renderPageButtons(totalPages);

  previousPage.disabled = currentPage === 1;
  nextPage.disabled = currentPage === totalPages;

  updateClearSearchButton();
}

function renderPageButtons(totalPages) {
  const candidates = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1
  ]);

  const pages = [...candidates]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  let previousRenderedPage = 0;

  pageButtons.innerHTML = pages
    .map((page) => {
      const gap =
        previousRenderedPage &&
        page - previousRenderedPage > 1
          ? '<span class="pageEllipsis">…</span>'
          : "";

      previousRenderedPage = page;

      return `
        ${gap}
        <button
          type="button"
          class="catalogPageButton${
            page === currentPage ? " active" : ""
          }"
          data-page="${page}"
          aria-label="Page ${page}"
          ${
            page === currentPage
              ? 'aria-current="page"'
              : ""
          }
        >
          ${page}
        </button>
      `;
    })
    .join("");

  pageButtons
    .querySelectorAll("[data-page]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        currentPage = Number(button.dataset.page);

        render();
        scrollToCatalog();
      });
    });
}

function reset() {
  currentPage = 1;
  search.value = "";

  const allProductsFilter = document.querySelector(
    'input[name="cat"][value="All products"]'
  );

  if (allProductsFilter) {
    allProductsFilter.checked = true;
  }

  updateClearSearchButton();
  render();
  search.focus();
}

function applyInitialCategory() {
  const initialCategory = new URLSearchParams(
    window.location.search
  ).get("category");

  if (!initialCategory) {
    return;
  }

  const initialRadio = [
    ...document.querySelectorAll('input[name="cat"]')
  ].find((input) => input.value === initialCategory);

  if (initialRadio) {
    initialRadio.checked = true;
  }
}

function scrollToCatalog() {
  if (!catalogBody) {
    return;
  }

  catalogBody.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

search.addEventListener("input", () => {
  currentPage = 1;
  updateClearSearchButton();
  render();
});

sort.addEventListener("change", () => {
  currentPage = 1;
  render();
});

clearSearch.addEventListener("click", () => {
  search.value = "";
  currentPage = 1;

  updateClearSearchButton();
  render();

  search.focus();
});

resetFilters.addEventListener("click", reset);

grid.addEventListener("click", async (event) => {
  const button = event.target.closest(".copyProductCode");

  if (!button) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const code = button.dataset.code || "";

  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const textArea = document.createElement("textarea");

    textArea.value = code;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);

    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }

  button.textContent = "Copied";

  window.setTimeout(() => {
    button.textContent = "Copy";
  }, 1400);
});

previousPage.addEventListener("click", () => {
  if (currentPage <= 1) {
    return;
  }

  currentPage -= 1;

  render();
  scrollToCatalog();
});

nextPage.addEventListener("click", () => {
  const maximumPage =
    Number(totalPagesLabel.textContent) || 1;

  if (currentPage >= maximumPage) {
    return;
  }

  currentPage += 1;

  render();
  scrollToCatalog();
});