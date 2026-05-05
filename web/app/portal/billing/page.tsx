/**
 * /portal/billing — placeholder while Paddle billing is in deferred
 * mode. When Paddle ships, this page becomes the customer billing
 * surface (current plan, next renewal, last payment, "Manage
 * Subscription" → Paddle customer-portal-sessions one-time URL).
 */
export const dynamic = "force-dynamic";

const EARLY_ACCESS_EMAIL = "adam@americaniron1.com";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Subscription management.
        </p>
      </div>

      <section className="rounded-md border border-equipment-700 bg-equipment-900 p-6">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">Your plan</h2>
          <span className="rounded-full border border-zinc-700 bg-equipment-800 px-3 py-1 text-xs uppercase tracking-wider text-zinc-300">
            Free
          </span>
        </header>
        <p className="mt-2 text-zinc-300">
          You&apos;re on the Free plan. While billing is in early-access mode,
          all signed-in users have full access to the AI Mechanic suite —
          diagnosis, troubleshooting, predictive maintenance, fault codes,
          recommended parts, and repair plans.
        </p>
      </section>

      <section className="rounded-md border border-accent/60 bg-equipment-900 p-6">
        <h2 className="text-lg font-bold text-accent">
          Subscriptions launching soon
        </h2>
        <p className="mt-2 text-zinc-200">
          Pro ($49/mo) and Shop ($199/mo) plans go live shortly via Paddle.
          For enterprise, multi-fleet, or early-access inquiries — including
          custom seats, API access, or volume pricing — get in touch:
        </p>
        <p className="mt-4">
          <a
            href={`mailto:${EARLY_ACCESS_EMAIL}?subject=fixmyiron%20billing%20%E2%80%94%20early%20access`}
            className="inline-block rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg hover:bg-accent-hover"
          >
            Contact {EARLY_ACCESS_EMAIL}
          </a>
        </p>
        <p className="mt-4 text-xs text-zinc-500">
          Billing will be handled by Paddle (Merchant of Record). Paddle
          handles VAT/GST/sales tax, currency conversion, and chargebacks
          globally — the price you see on /pricing is the price you pay,
          taxes inclusive.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
          What&apos;s included today (free, while billing is deferred)
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { name: "Diagnosis Engine", href: "/portal/diagnosis" },
            { name: "Guided Troubleshooting", href: "/portal/troubleshooting" },
            { name: "Recommended Parts", href: "/portal/recommended-parts" },
            { name: "Repair Plan", href: "/portal/repair-plan" },
            { name: "Predictive Maintenance", href: "/portal/predictive" },
            { name: "Equipment", href: "/portal/equipment" },
            { name: "Fault Codes", href: "/portal/fault-codes" },
            { name: "Parts Search", href: "/portal/parts" },
          ].map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="rounded-md border border-equipment-700 bg-equipment-900 p-3 text-sm font-medium text-zinc-100 hover:border-accent hover:bg-equipment-800"
            >
              {s.name} →
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
