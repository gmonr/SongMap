import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SongMap",
  description:
    "See the structure: chord bars, sections, and lyrics at a glance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/songs" className="text-lg font-bold tracking-tight">
              <span className="text-blue-600">Song</span>Map
            </Link>
            <nav className="text-sm text-slate-500">
              <Link href="/songs" className="hover:text-slate-900">
                Library
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
