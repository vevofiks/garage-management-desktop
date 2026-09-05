import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd()),
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['better-sqlite3', 'pg'],
  outputFileTracingExcludes: {
    '*': ['./dist/**'],
  },
};

export default nextConfig;

