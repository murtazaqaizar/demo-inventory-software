import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { PasswordInput } from "@/components/password-input";
import { inputClass } from "@/components/ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirectTo: "/",
      });
    } catch (err) {
      if (err instanceof AuthError) redirect("/login?error=1");
      throw err; // re-throw the internal redirect signIn uses on success
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form
        action={login}
        className="w-full max-w-[400px] space-y-5 rounded-panel border border-line bg-surface p-8 shadow-panel"
      >
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
            Inventory &amp; Accounts
          </h1>
          <p className="mt-1 text-[15px] text-ink-muted">
            Wholesale abrasives · sign in to continue
          </p>
        </div>

        {error && (
          <p className="rounded-control border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-[15px] text-bad">
            Invalid username or password.
          </p>
        )}

        <div>
          <label
            htmlFor="username"
            className="mb-1.5 block text-[13px] font-medium text-ink-muted"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            required
            autoComplete="username"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[13px] font-medium text-ink-muted"
          >
            Password
          </label>
          <PasswordInput id="password" name="password" required autoComplete="current-password" />
        </div>

        <button
          type="submit"
          className="h-10 w-full rounded-control bg-accent text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-accent-hover active:bg-accent-press focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-accent-soft)]"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
