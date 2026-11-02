import { signIn } from "@/core/auth";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border p-8"
      >
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm opacity-70">Use your Google account to continue.</p>
        <button type="submit" className="rounded-lg bg-foreground px-4 py-2 text-background">
          Continue with Google
        </button>
      </form>
    </main>
  );
}
