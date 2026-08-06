"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const items = [
  { name: "Essential Heavy Tee", category: "Clothing", details: "12 colors · 6 sizes", status: "IN STOCK", tone: "ink" },
  { name: "Everyday Crewneck", category: "Clothing", details: "8 colors · 6 sizes", status: "IN STOCK", tone: "fog" },
  { name: "Contour Canvas Tote", category: "Accessories", details: "5 colors · 2 sizes", status: "IN STOCK", tone: "sand" },
  { name: "Studio Ceramic Mug", category: "Home & Living", details: "4 colors · 2 sizes", status: "LOW STOCK", tone: "clay" },
  { name: "Classic Pullover Hoodie", category: "Clothing", details: "10 colors · 7 sizes", status: "IN STOCK", tone: "navy" },
  { name: "Recycled Cap", category: "Accessories", details: "6 colors · 1 size", status: "IN STOCK", tone: "olive" }
];
const categories = ["All products", "Clothing", "Home & Living", "Accessories"];

export default function Catalog() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All products");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState("newest");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) =>
      (!q || `${item.name} ${item.category}`.toLowerCase().includes(q)) &&
      (category === "All products" || item.category === category) &&
      (!inStockOnly || item.status === "IN STOCK")
    );
    return sort === "name" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : filtered;
  }, [query, category, inStockOnly, sort]);
  const reset = () => { setQuery(""); setCategory("All products"); setInStockOnly(false); };

  return (
    <main className="catalogPage">
      <header className="topbar compact">
        <Link href="/" className="brand"><span className="mark">T</span> TEEMON</Link>
        <nav><Link href="/catalog" className="active">Catalog</Link><Link href="/">Home</Link></nav>
        <Link href="/admin/dashboard" className="adminLink">Internal portal ↗</Link>
      </header>
      <section className="catalogHero">
        <span className="eyebrow">Public catalog</span>
        <h1>Find your next<br/>best seller.</h1>
        <div className="searchBox"><span aria-hidden="true">⌕</span><input aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by product name or keyword"/><button type="button" onClick={() => query && setQuery("")}>{query ? "Clear" : "Search"}</button></div>
      </section>
      <section className="catalogBody">
        <aside>
          <b>Categories</b>
          {categories.map((name) => <label key={name}><input type="radio" name="cat" checked={category === name} onChange={() => setCategory(name)}/>{name}<span>{name === "All products" ? items.length : items.filter((item) => item.category === name).length}</span></label>)}
          <hr/><b>Availability</b>
          <label><input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)}/> In stock only</label>
        </aside>
        <div className="results">
          <div className="resultHead"><p><b>{results.length} products</b> ready to explore</p><select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="name">Name A–Z</option></select></div>
          {results.length ? <div className="catalogGrid">{results.map((item, index) => <article key={item.name}><div className={`catalogImage ${item.tone}`}><span>0{index + 1}</span><div className="mockProduct small"><i/><i/><i/></div></div><div className="catalogMeta"><span>{item.category}</span><h3>{item.name}</h3><p>{item.details}</p><b className={item.status === "LOW STOCK" ? "low" : ""}>● {item.status}</b></div></article>)}</div> : <div className="emptyState"><span>NO MATCHES</span><h2>Try a broader search.</h2><p>Clear a filter or search for another product name.</p><button className="button primary" onClick={reset}>Reset filters</button></div>}
        </div>
      </section>
    </main>
  );
}
