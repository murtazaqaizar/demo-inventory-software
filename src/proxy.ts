// Next 16 renamed `middleware` -> `proxy`. NextAuth's `auth` wrapper has the same
// signature, so we export it as the proxy function to gate routes behind login.
export { auth as proxy } from "@/auth";

export const config = {
  // Run on everything except Next internals, the auth API, and static assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
