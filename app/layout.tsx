import type { Metadata } from "next";
import { SITE_METADATA } from "@/lib/app/site-metadata";
import localFont from "next/font/local";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/app/theme";
import { Analytics } from "@vercel/analytics/next";

// The font file lives in this repository, and that is the whole point.
// The remote Google loader downloads it during the build: when Google declines the
// request, Next still emits the CSS, which then points at a file that does not
// exist — a failed deploy from a build that was green locally. A build must
// only be able to fail for reasons that belong to this repository.
// Each font is variable, so one file covers the whole weight range.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

// The display font (choice 3C of the theme planches, 10 November 2026): the titles, the one big
// amount and the name of the mark. Its file also carries the optical size the big amount uses.
const bricolage = localFont({
  src: "./fonts/BricolageGrotesqueVariable.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = SITE_METADATA;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script sets `data-theme` before React sees the page: the attribute is expected to differ.
    <html lang="fr" className={`${inter.variable} ${bricolage.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-ground text-ink font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
