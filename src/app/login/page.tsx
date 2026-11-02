import { signIn } from "@/core/auth";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-8"
      >
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Use your Google account to continue.</p>
        <Button type="submit">Continue with Google</Button>
      </form>
    </main>
  );
}
