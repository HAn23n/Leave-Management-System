function buildSecurityHeaders() {
  const isDev = process.env.NODE_ENV !== "production";

  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        // Nonce/strict-dynamic CSP was tried and reverted: Next.js's own
        // injected scripts (framework runtime, RSC hydration payload) didn't
        // reliably pick up the nonce in practice, blocking all client JS in
        // both dev and production. 'unsafe-inline' is weaker but the app
        // actually works; script-src is still restricted to same-origin.
        // 'unsafe-eval' is only added in dev, for next dev's Fast Refresh runtime.
        `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://*.supabase.co",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
