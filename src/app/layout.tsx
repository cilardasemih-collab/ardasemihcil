import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "ardasemihcil",
  description: "Fabrika verimlilik analiz platformu"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
