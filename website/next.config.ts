import path from "node:path";

import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};
const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-gfm"]],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
