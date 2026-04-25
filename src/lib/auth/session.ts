import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

export async function requireAuthorizedUser({
  allowedAppRoles,
  loginPath,
}: {
  allowedAppRoles: string[];
  loginPath: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(loginPath);
  }

  const appRole = String(user.app_metadata?.role ?? "");
  if (!allowedAppRoles.includes(appRole)) {
    await supabase.auth.signOut();
    redirect(loginPath);
  }

  return user;
}
