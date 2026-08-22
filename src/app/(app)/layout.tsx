import { requireUser } from "@/lib/guards";
import { signOut } from "@/auth";
import { sectionsFor } from "@/lib/nav";
import { TopNav } from "@/components/top-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser(); // redirects to /login if not signed in

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav
        groups={sectionsFor(user.role)}
        user={{ name: user.name, role: user.role }}
        signOutAction={signOutAction}
      />
      <main className="mx-auto w-full max-w-[1520px] flex-1 px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
