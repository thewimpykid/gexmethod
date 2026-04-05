import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GEX/DEX Dashboard",
  description: "Gamma & Delta Exposure indicator for options markets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
