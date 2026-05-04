/**
 * Portal home — placeholder for the foundation slice. The 9 product
 * surfaces (diagnosis, troubleshooting, fault-codes, parts, recommended,
 * repair-plan, predictive, billing, plus the parts search) replace this
 * in the next slice.
 */
export default function PortalHome() {
  const surfaces: Array<{
    name: string;
    href: string;
    tier: string;
    live?: boolean;
  }> = [
    { name: "Diagnosis", href: "/portal/diagnosis", tier: "paid" },
    { name: "Guided Troubleshooting", href: "/portal/troubleshooting", tier: "paid" },
    { name: "Fault Codes", href: "/portal/fault-codes", tier: "free + paid" },
    { name: "Parts Search", href: "/portal/parts", tier: "free", live: true },
    { name: "Recommended Parts", href: "/portal/recommended-parts", tier: "free" },
    { name: "Repair Plan", href: "/portal/repair-plan", tier: "free" },
    { name: "Predictive Maintenance", href: "/portal/predictive", tier: "paid" },
    { name: "Billing", href: "/portal/billing", tier: "free" },
  ];
  return (
    <div>
      <h1 className="text-2xl font-bold">Portal</h1>
      <p className="mt-2 text-zinc-300">
        Product surfaces ship in the next release. Foundation (auth, billing
        webhook, AI client, schema) is in place.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {surfaces.map((s) =>
          s.live ? (
            <li
              key={s.name}
              className="rounded-md border border-accent/60 bg-equipment-900 p-4"
            >
              <a
                href={s.href}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-accent">{s.name}</span>
                  <span className="text-xs uppercase tracking-wider text-accent/80">
                    {s.tier} · live
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{s.href}</p>
              </a>
            </li>
          ) : (
            <li
              key={s.name}
              className="rounded-md border border-equipment-700 bg-equipment-900 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs uppercase tracking-wider text-zinc-400">
                  {s.tier}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{s.href}</p>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
