"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/map", label: "Map" },
  { href: "/projects", label: "Projects" },
  { href: "/clashes", label: "Clashes" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/report", label: "Report" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-4">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
        >
          DigSync
        </Link>

        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-neutral-900 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
