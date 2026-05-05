import Link from "next/link";
import { MonetizationBanner } from "@/components/monetization-banner";
import { LearnMoreButton } from "@/components/learn-more-button";
import { publicEnv } from "@/lib/env";

export default function HomePage() {
  return (
    <>
      <MonetizationBanner />
      <main className="mx-auto max-w-6xl px-4 py-16">
        <section className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-widest text-accent">
            AI Mechanic
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-6xl">
            Diagnose, troubleshoot, and order parts for heavy equipment —
            powered by AI.
          </h1>
          <p className="max-w-2xl text-lg text-zinc-300">
            Enter a fault code, describe a symptom, or hand us a service
            history. Get a structured diagnostic playbook, repair plan, and the
            exact parts you need to be back on the job tomorrow.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/sign-in"
              className="rounded-md bg-accent px-5 py-3 font-semibold text-accent-fg hover:bg-accent-hover"
            >
              Sign up free
            </Link>
            <Link
              href="/pricing"
              className="rounded-md border border-equipment-600 px-5 py-3 font-semibold text-zinc-100 hover:bg-equipment-800"
            >
              See pricing
            </Link>
            <LearnMoreButton videoSrc={publicEnv.learnMoreVideoUrl} />
          </div>
        </section>
      </main>
    </>
  );
}
