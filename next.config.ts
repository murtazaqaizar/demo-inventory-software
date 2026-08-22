import type { NextConfig } from "next";



const nextConfig: NextConfig = {

  // The generated Prisma client + pg adapter are server-only; don't bundle them.

  // mupdf is WASM and is only ever called from a server action; bundling it
  // would drag the whole renderer into the client graph.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "mupdf"],

  experimental: {

    // The letterhead is uploaded through a server action, and the default body

    // cap is 1MB — smaller than a normal A4 scan. The action itself refuses

    // anything over 4MB with a readable message.

    serverActions: { bodySizeLimit: "8mb" },

  },

};



export default nextConfig;

