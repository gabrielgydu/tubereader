import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A stray ~/yarn.lock makes Next infer $HOME as the workspace root, which
  // widens output file tracing to the whole home directory. Pin it here.
  outputFileTracingRoot: path.join(__dirname),
  // Origins allowed to reach dev-only endpoints. Production (`next start`)
  // ignores this, so the Tailscale entries only matter when you expose the
  // dev server instead of the built one.
  allowedDevOrigins: [
    "tubereader.local",
    // Tailscale Serve terminates TLS and forwards with this Host header.
    "p16s.tail7f988e.ts.net",
    "*.tail7f988e.ts.net",
  ],
};

export default nextConfig;
