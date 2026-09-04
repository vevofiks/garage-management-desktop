import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd()),
  outputFileTracingExcludes: {
    '*': ['./dist/**'],
  },
};

export default nextConfig;

