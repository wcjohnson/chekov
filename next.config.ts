import type { NextConfig } from "next";

const [repoOwner, repoName] = process.env.GITHUB_REPOSITORY?.split("/") ?? [];
const isProjectPagesRepo =
  repoOwner && repoName && repoName !== `${repoOwner}.github.io`;
const pagesBasePath = isProjectPagesRepo ? `/${repoName}` : undefined;

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  reactCompiler: true,
};

export default nextConfig;
