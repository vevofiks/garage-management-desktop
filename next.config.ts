import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd()),
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['better-sqlite3', 'pg'],
  // Keys match route paths with picomatch `contains` (and the literal 'next-server'
  // trace), so '*' applies to every route. ./data holds the local SQLite database — on a
  // developer machine the live one, with customer records, password hashes and session
  // tokens. db.ts's filesystem access makes the tracer copy it into the standalone build,
  // and from there into the installer, unless it is excluded here.
  outputFileTracingExcludes: {
    '*': ['./dist/**', './data/**'],
  },
};

export default nextConfig;

