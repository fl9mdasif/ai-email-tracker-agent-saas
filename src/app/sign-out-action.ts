"use server";

import { signOut } from "@/core/auth";

/** Signs the user out and returns them to the public homepage. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
