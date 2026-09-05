import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd()),
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/better-sqlite3/**/*'],
    '/**': ['./node_modules/better-sqlite3/**/*'],
  },
  outputFileTracingExcludes: {
    '*': ['./dist/**'],
  },
};

export default nextConfig;

