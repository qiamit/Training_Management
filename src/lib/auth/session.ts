import { redirect } from "next/navigation";

import {
  clearSessionCookie,
  getCurrentUser,
  signOutCurrentUser,
} from "@/lib/firebase/auth-server";
import { getAppRole } from "@/lib/firebase/auth-user";

export async function requireAuthorizedUser({
  allowedAppRoles,
  loginPath,
}: {
  allowedAppRoles: string[];
  loginPath: string;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(loginPath);
  }

  const appRole = getAppRole(user);
  if (!appRole || !allowedAppRoles.includes(appRole)) {
    await signOutCurrentUser();
    redirect(loginPath);
  }

  return user;
}

export { clearSessionCookie, getCurrentUser };
