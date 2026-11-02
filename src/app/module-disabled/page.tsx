import Link from "next/link";

export default function ModuleDisabledPage() {
  return (
    <main className="flex min-h-screen flex-col items-start justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">This product is not enabled</h1>
      <p className="max-w-md text-sm opacity-70">
        Your workspace does not have access to this module yet. Contact support to enable it.
      </p>
      <Link href="/" className="rounded-lg border px-4 py-2">
        Back home
      </Link>
    </main>
  );
}
