import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000"),
  title: "Gatey — Bennett Valley Gate",
  description: "Open Bennett Valley Gate and manage household access.",
  applicationName: "Gatey",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gatey",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "Gatey",
    title: "Gatey — Bennett Valley Gate",
    description: "Simple gate access for Bennett Valley.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Gatey — Simple gate access for Bennett Valley" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Gatey — Bennett Valley Gate",
    description: "Simple gate access for Bennett Valley.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
