"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

export async function logout() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Even if Supabase env is missing, fall through to redirect home.
  }
  redirect("/");
}
