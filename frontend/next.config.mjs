/** @type {import("next").NextConfig} */
const rawUser = process.env.USER || process.env.USERNAME || "dev";
const safeUser = String(rawUser).replace(/[^a-zA-Z0-9_-]/g, "") || "dev";
const distDir = process.env.NEXT_DIST_DIR || `.next-${safeUser}`;

const nextConfig = {
  distDir,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
