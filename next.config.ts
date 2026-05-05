/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // This is the mandatory line
  images: {
    unoptimized: true, // Also mandatory for static exports
  },
};

export default nextConfig;