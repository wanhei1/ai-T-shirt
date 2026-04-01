/** @type {import("next").NextConfig} */
const rawUser = process.env.USER || process.env.USERNAME || "dev";
const safeUser = String(rawUser).replace(/[^a-zA-Z0-9_-]/g, "") || "dev";
const distDir = process.env.NEXT_DIST_DIR || `.next-${safeUser}`;

const nextConfig = {
  distDir,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const backendTarget = process.env.NEXT_INTERNAL_API_PROXY || "http://127.0.0.1:8185";
    return [
      {
        source: "/backend/:path*",
        destination: `${backendTarget}/:path*`,
      },
    ];
  },
}

export default nextConfig
