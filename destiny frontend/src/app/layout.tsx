import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CookieConsent, SiteFooter, SiteHeader } from "./components";
import "./globals.css";

export const metadata: Metadata = {
  title: "destiny",
  description:
    "Anonymous Discord matchmaking by the adore.rest network. Apply, match, and reveal on your terms.",
  icons: { icon: "/favicon.png" },
  openGraph: {
    title: "destiny",
    description:
      "Anonymous Discord matchmaking by the adore.rest network. Apply, match, and reveal on your terms.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fff9f6",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
        <CookieConsent />
      </body>
    </html>
  );
}
