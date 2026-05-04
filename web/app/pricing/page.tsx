import { MonetizationBanner } from "@/components/monetization-banner";

/**
 * Pricing page — placeholder for the foundation slice.
 * Full Paddle.js checkout overlay + localized prices land with the
 * billing surface in the next slice.
 */
export default function PricingPage() {
  const plans = [
    {
      name: "Free",
      price: "$0",
      blurb: "Basic diagnostics included with signup.",
      features: ["3 diagnoses / month", "Fault code lookups (basic)"],
    },
    {
      name: "Pro",
      price: "$49 / mo",
      blurb: "For independent mechanics.",
      features: [
        "Unlimited diagnoses",
        "Scenario engine",
        "PDF export",
        "Predictive maintenance",
      ],
      featured: true,
    },
    {
      name: "Shop",
      price: "$199 / mo",
      blurb: "For shops and fleets.",
      features: ["Everything in Pro", "5 seats", "API access"],
    },
  ];
  return (
    <>
      <MonetizationBanner />
      <main className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-3xl font-bold sm:text-4xl">Pricing</h1>
        <p className="mt-2 text-zinc-300">
          Paddle handles billing, currency, and tax. Prices shown in USD;
          customers see their local currency at checkout.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-lg border p-6 ${
                p.featured
                  ? "border-accent bg-equipment-900"
                  : "border-equipment-700 bg-equipment-900/60"
              }`}
            >
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="mt-1 text-2xl font-bold">{p.price}</p>
              <p className="mt-2 text-sm text-zinc-400">{p.blurb}</p>
              <ul className="mt-4 space-y-1 text-sm text-zinc-200">
                {p.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs text-zinc-500">
          Checkout integration ships with the billing surface in the next
          release.
        </p>
      </main>
    </>
  );
}
