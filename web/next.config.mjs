/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: false,
  },
  async redirects() {
    // portal.fixmyiron.com hosts the auth-gated app only; the marketing
    // site lives at www.fixmyiron.com (legacy, untouched). Anyone landing
    // at the bare portal subdomain has nothing useful at /, so bounce
    // them to /portal where Clerk's middleware takes over.
    // The host matcher scopes this to prod — staging (which still serves
    // marketing at /) and the *.workers.dev fallback URL are unaffected.
    return [
      {
        source: "/",
        has: [{ type: "host", value: "portal.fixmyiron.com" }],
        destination: "/portal",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
