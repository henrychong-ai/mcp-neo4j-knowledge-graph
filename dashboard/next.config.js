/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable strict mode for better development experience
  reactStrictMode: true,

  // Disable telemetry
  telemetry: false,

  // Configure webpack to handle neo4j-driver properly
  webpack: (config, { isServer }) => {
    // Neo4j driver should only run on server
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
