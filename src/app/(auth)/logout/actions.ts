"use server";

import { redirect } from "next/navigation";

import { signOutCurrentUser } from "@/lib/firebase/auth-server";

export async function logout() {
  try {
    await signOutCurrentUser();
  } catch {
    // Fall through to redirect home.
  }
  redirect("/");
}
