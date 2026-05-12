/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We don't use Image optimization (admin tool, mocked images only)
  images: { unoptimized: true },
};

module.exports = nextConfig;
