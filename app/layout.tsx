import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TEEMON Catalog — Product Catalog Management",
  description: "Public product catalog and internal catalog management portal."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
