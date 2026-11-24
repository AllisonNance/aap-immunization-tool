import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The dev indicator sits over the bottom tab bar (and the top corners over the
  // sample-data banner). Errors still show in the dev overlay with this off.
  devIndicators: false,
};

export default nextConfig;
