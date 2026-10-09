import Link from "next/link";

const CARDS = [
  {
    href: "/map",
    title: "Map",
    body: "See every planned, running and completed works project on one map.",
  },
  {
    href: "/projects",
    title: "Projects",
    body: "Department, contractor, purpose, planned vs actual dates and delay reasons.",
  },
  {
    href: "/clashes",
    title: "Clashes",
    body: "Works on the same road that overlap in time, or start right after it was restored.",
  },
  {
    href: "/dashboard",
    title: "Dashboard",
    body: "Delays, repeat digs, contested completions and a per-department scorecard.",
  },
  {
    href: "/report",
    title: "Report",
    body: "Flag an issue, including digs that are not listed anywhere, with a geotagged photo.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          DigSync
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-neutral-600 dark:text-neutral-300">
          DigSync is a public registry and coordination layer for civic works —
          roads, drains, water pipelines, power cables and fibre. It shows
          residents what is being dug up and when, and warns departments when
          their projects overlap or dig up a road someone else just restored,
          then proposes a schedule that shares one trench instead of two.
        </p>
      </section>

      <section aria-labelledby="features-heading">
        <h2 id="features-heading" className="mb-4 text-lg font-semibold">
          Explore
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <li key={card.href}>
              <Link
                href={card.href}
                className="block h-full rounded-lg border border-neutral-200 p-4 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                <span className="font-semibold">{card.title}</span>
                <span className="mt-1 block text-sm text-neutral-600 dark:text-neutral-400">
                  {card.body}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
