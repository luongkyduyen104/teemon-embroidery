import Link from "next/link";

const products = [
  { name: "Essential Heavy Tee", category: "Clothing", price: "From $12.50", tone: "ink", badge: "Bestseller" },
  { name: "Contour Canvas Tote", category: "Accessories", price: "From $8.90", tone: "sand", badge: "New" },
  { name: "Studio Ceramic Mug", category: "Home & Living", price: "From $7.20", tone: "clay", badge: "In stock" }
];

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <Link href="/" className="brand"><span className="mark">T</span> TEEMON</Link>
        <nav><Link href="/catalog">Catalog</Link><a href="#categories">Categories</a><a href="#about">About</a></nav>
        <Link href="/admin/dashboard" className="adminLink">Internal portal <span>↗</span></Link>
      </header>

      <section className="hero">
        <div className="eyebrow">Product catalog · 2026 collection</div>
        <h1>Made to be<br/><em>remembered.</em></h1>
        <p>Thoughtful essentials for everyday brands. Explore ready-to-customize products, clear variants, and live stock status.</p>
        <div className="heroActions">
          <Link className="button primary" href="/catalog">Explore catalog <span>→</span></Link>
          <a className="button ghost" href="#categories">Browse categories</a>
        </div>
        <div className="heroVisual">
          <div className="shape shapeA"><span>180 GSM</span></div>
          <div className="shape shapeB"><span>100% COTTON</span></div>
          <div className="shape shapeC"></div>
          <div className="heroNote">ESSENTIALS<br/>FOR YOUR<br/>NEXT IDEA.</div>
        </div>
      </section>

      <section className="categoryStrip" id="categories">
        <span>Shop by category</span>
        <Link href="/catalog">Clothing <b>↗</b></Link>
        <Link href="/catalog">Home & Living <b>↗</b></Link>
        <Link href="/catalog">Accessories <b>↗</b></Link>
      </section>

      <section className="featured">
        <div className="sectionHead">
          <div><span className="eyebrow">Curated selection</span><h2>Products people love</h2></div>
          <Link href="/catalog">View all products →</Link>
        </div>
        <div className="productGrid">
          {products.map((product, index) => (
            <article className="productCard" key={product.name}>
              <div className={`productImage ${product.tone}`}>
                <span className="productNo">0{index + 1}</span>
                <span className="productBadge">{product.badge}</span>
                <div className="mockProduct"><i/><i/><i/></div>
              </div>
              <div className="productMeta">
                <div><span>{product.category}</span><h3>{product.name}</h3></div>
                <strong>{product.price}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="statement" id="about">
        <p>One source of truth.</p>
        <h2>Accurate products.<br/>Confident decisions.</h2>
        <div className="stats"><span><b>3</b> fixed categories</span><span><b>Live</b> variant status</span><span><b>USD</b> consistent pricing</span></div>
      </section>
      <footer><span>© 2026 TEEMON Catalog</span><span>Built for clarity, designed to scale.</span></footer>
    </main>
  );
}
