import { APP_NAME } from "@/app/brand";

export function HomeHero() {
  return (
    <section
      className="relative overflow-hidden rounded-xl border border-border bg-surface"
      aria-labelledby="home-hero-heading"
    >
      <img
        src="/features/hero-cover.png"
        alt="Traveler in a sunlit historic plaza using a smartphone for accessible tourism."
        width={1200}
        height={420}
        className="block h-48 w-full object-cover object-center sm:h-60 md:h-72"
        fetchPriority="high"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg via-bg/70 to-transparent"
        aria-hidden
      />
      <div className="relative px-5 pb-6 sm:absolute sm:inset-x-0 sm:bottom-0 sm:px-8 sm:pb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          On-device AI for travel
        </p>
        <h1
          id="home-hero-heading"
          className="mt-1 text-2xl font-bold tracking-tight text-fg sm:text-3xl md:text-4xl"
        >
          {APP_NAME}
        </h1>
        <p className="mt-2 max-w-prose text-base leading-relaxed text-fg-muted sm:text-lg">
          Vision, reading, path assistance, and sign-language support powered by AI on your
          phone. Built for accessible tourism.
        </p>
      </div>
    </section>
  );
}
