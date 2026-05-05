import { MonetizationBanner } from "@/components/monetization-banner";

/**
 * Public /pricing page. Three tiers shown; Pro/Shop CTAs route to a
 * mailto for early-access while billing is in deferred mode (no Paddle
 * checkout overlay yet — see PRODUCTION_CUTOVER.md "DEFERRED — PADDLE"
 * for the activation playbook).
 */

const EARLY_ACCESS_EMAIL = "adam@americaniron1.com";

interface Tier {
  name: string;
  price: string;
  cadence?: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    blurb: "Get a feel for the AI Mechanic and search 43k+ parts.",
    features: [
      "3 chat diagnoses per month",
      "Search 43k+ Caterpillar + Costex parts",
      "Fault-code lookup (basic description)",
      "Recommended parts from any diagnosis",
      "Repair plan from any diagnosis",
    ],
    cta: { label: "Sign up free", href: "/sign-in" },
  },
  {
    name: "Pro",
    price: "$49",
    cadence: "/month",
    blurb: "For independent mechanics. Unlimited diagnoses with structured playbooks.",
    features: [
      "Everything in Free",
      "Unlimited diagnoses",
      "Structured scenario engine (causes, tests, parts, safety)",
      "Guided troubleshooting wizard",
      "Predictive maintenance for your fleet",
      "Full fault-code detail (causes, repair actions, related parts)",
      "PDF export of diagnoses",
    ],
    cta: {
      label: "Request early access",
      href: `mailto:${EARLY_ACCESS_EMAIL}?subject=fixmyiron%20Pro%20%E2%80%94%20early%20access`,
    },
    featured: true,
  },
  {
    name: "Shop",
    price: "$199",
    cadence: "/month",
    blurb: "For shops and fleet operators. Up to 5 seats and an API.",
    features: [
      "Everything in Pro",
      "5 seats included",
      "API access for fleet management integration",
      "Priority support",
      "Quarterly fleet review",
    ],
    cta: {
      label: "Request early access",
      href: `mailto:${EARLY_ACCESS_EMAIL}?subject=fixmyiron%20Shop%20%E2%80%94%20early%20access`,
    },
  },
];

export default function PricingPage() {
  return (
    <>
      <MonetizationBanner />
      <main className="mx-auto max-w-6xl px-4 py-16">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold sm:text-4xl">Pricing</h1>
          <p className="max-w-2xl text-zinc-300">
            Three plans. Sign up free in under a minute. Pro and Shop are
            launching soon — drop us a line for early access and we&apos;ll
            get you set up.
          </p>
        </header>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {TIERS.map((t) => (
            <article
              key={t.name}
              className={`rounded-lg border p-6 ${
                t.featured
                  ? "border-accent bg-equipment-900 shadow-lg shadow-accent/10"
                  : "border-equipment-700 bg-equipment-900/60"
              }`}
            >
              <header>
                <h2 className="text-xl font-semibold text-zinc-100">{t.name}</h2>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-zinc-100">{t.price}</span>
                  {t.cadence && (
                    <span className="text-sm text-zinc-400">{t.cadence}</span>
                  )}
                </p>
                <p className="mt-2 text-sm text-zinc-400">{t.blurb}</p>
              </header>
              <ul className="mt-5 space-y-2 text-sm text-zinc-200">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-accent">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={t.cta.href}
                className={`mt-6 block rounded-md px-4 py-2 text-center text-sm font-semibold ${
                  t.featured
                    ? "bg-accent text-accent-fg hover:bg-accent-hover"
                    : "border border-equipment-600 bg-equipment-800 text-zinc-100 hover:bg-equipment-700"
                }`}
              >
                {t.cta.label}
              </a>
            </article>
          ))}
        </div>

        <p className="mt-10 text-sm text-zinc-500">
          Subscriptions are launching soon. Until then, all signed-in users
          have access to the full feature set so you can evaluate end-to-end.
          Pricing shown above will be enforced at launch via Paddle (Merchant
          of Record), which handles VAT/GST/sales tax, fraud, and currency
          conversion globally.
        </p>
      </main>
    </>
  );
}
