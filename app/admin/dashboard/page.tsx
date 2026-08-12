"use client";
import Link from "next/link";

const nav = [
  ["Dashboard", "/Icon/dashboard.svg"],
  ["View catalog", "/Icon/catalog.svg"],
  ["Products", "/Icon/Products.svg"],
  ["Variants", "/Icon/Variant.svg"],
  ["Fulfillment", ""],
  ["Import / Export", "/Icon/Import_export.svg"],
  ["Users", "/Icon/users.svg"],
  ["Activity logs", "/Icon/Activity_logs.svg"]
];
const activity = [
  ["Maya Chen","Published","Essential Heavy Tee","2 min ago"],
  ["Noah Williams","Updated stock","TSHIRT-001-BLK-M","18 min ago"],
  ["Maya Chen","Created draft","Classic Pullover Hoodie","1 hr ago"],
  ["Admin","Imported","48 stock status rows","3 hrs ago"]
];

export default function Dashboard() {
  return (
    <main className="adminShell">
      <aside className="sidebar">
        <Link href="/" className="brand light"><span className="mark">T</span> TEEMON</Link>
        <nav>{nav.map(([item, icon],i)=><a className={`${i===0?"selected":""}${item==="View catalog"?" catalogSidebarLink":""}`} href={item==="View catalog"?"/catalog":"#"} key={item}><span style={icon ? { maskImage: `url(${icon})`, WebkitMaskImage: `url(${icon})` } : undefined}>{icon ? "" : "◎"}</span>{item}{item==="Products"&&<b>24</b>}</a>)}</nav>
        <div className="userCard"><div>MC</div><p><b>Maya Chen</b><span>Root Admin</span></p><button aria-label="User menu">•••</button></div>
      </aside>
      <section className="adminMain">
        <header><div><span className="eyebrow">Tuesday, July 28</span><h1>Good afternoon, Maya.</h1><p>Here’s what’s happening across your catalog today.</p></div><div className="adminActions"><button className="iconBtn">⌕</button><button className="iconBtn">♢</button><button className="button primary">＋ New product</button></div></header>
        <div className="metricGrid">
          {[["24","Total products","+3 this month"],["16","Published","67% of catalog"],["5","Draft","Needs attention"],["142","Active variants","11 out of stock"]].map((m,i)=><article key={m[1]}><div className={`metricIcon m${i}`}>{["□","●","◫","◇"][i]}</div><span>{m[1]}</span><h2>{m[0]}</h2><p>{m[2]}</p></article>)}
        </div>
        <div className="adminGrid">
          <section className="panel attention">
            <div className="panelHead"><div><span className="eyebrow">Action center</span><h2>Needs attention</h2></div><button>View products →</button></div>
            {[["Missing fulfillment","7 products","Complete weight and pricing by size"],["Out of stock","11 variants","Review stock status with warehouse"],["Missing charts","4 products","Add size or color reference charts"]].map((x,i)=><div className="attentionRow" key={x[0]}><span className={`alertIcon a${i}`}>{["!","↓","□"][i]}</span><div><b>{x[0]}</b><p>{x[2]}</p></div><strong>{x[1]}</strong><button>→</button></div>)}
          </section>
          <section className="panel readiness">
            <div className="panelHead"><div><span className="eyebrow">Catalog health</span><h2>Publish readiness</h2></div></div>
            <div className="donut"><div><b>78%</b><span>ready</span></div></div>
            <ul><li><span className="green"/>Ready to publish <b>7</b></li><li><span className="yellow"/>Warnings only <b>4</b></li><li><span className="red"/>Blocked <b>2</b></li></ul>
          </section>
        </div>
        <section className="panel activity">
          <div className="panelHead"><div><span className="eyebrow">Audit trail</span><h2>Recent activity</h2></div><button>View activity log →</button></div>
          <div className="activityTable">{activity.map((a,i)=><div className="activityRow" key={i}><div className="avatar">{a[0].split(" ").map(x=>x[0]).join("").slice(0,2)}</div><b>{a[0]}</b><span>{a[1]}</span><strong>{a[2]}</strong><time>{a[3]}</time><button>•••</button></div>)}</div>
        </section>
      </section>
    </main>
  );
}
