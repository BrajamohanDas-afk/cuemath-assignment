import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { resolveServerUserId } from "@/lib/auth-user";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flashcard Engine",
  description:
    "Generate flashcards from PDFs and review them with spaced repetition.",
};

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  weight: ["400", "500"],
});

const navItems = [
  { href: "/", label: "Home" },
  { href: "/login", label: "Login" },
  { href: "/account", label: "Account" },
  { href: "/upload", label: "Upload" },
  { href: "/decks", label: "Decks" },
  { href: "/review", label: "Review" },
  { href: "/progress", label: "Progress" },
];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await resolveServerUserId();
  const visibleNavItems = userId
    ? navItems.filter((item) => item.href !== "/login")
    : navItems;

  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full text-[var(--ink)]">
        <div className="relative flex min-h-full flex-col">
          <header className="site-header">
            <div className="shell flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <p className="text-[0.7rem] font-medium uppercase tracking-[0.26em] text-[var(--accent)]">
                  Cuemath Build Challenge
                </p>
                <h1 className="text-lg font-semibold tracking-tight">
                  Flashcard Engine
                </h1>
              </div>
              <nav className="flex flex-wrap items-center gap-2">
                {visibleNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.55)] px-3 py-1.5 text-sm font-medium text-[var(--ink-dim)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <p className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
                Flashcard System
              </p>
            </div>
          </header>
          <main className="relative z-10 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
