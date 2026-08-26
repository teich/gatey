import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gatey — Oakview Gate",
  description: "Simple guest access for Oakview Gate",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
