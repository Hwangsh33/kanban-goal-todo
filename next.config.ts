import type { NextConfig } from "next";

// Cache Components is intentionally not enabled: every API route reads MongoDB and must run per request.
const nextConfig: NextConfig = {};

export default nextConfig;
