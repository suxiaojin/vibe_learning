import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: "90mb",
    serverActions: {
      bodySizeLimit: "8mb"
    }
  }
};

export default nextConfig;
