import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, resolveUserFromSessionCookie } from "./auth-server";
import { isFirebaseConfigured } from "./config";
import type { AppAuthUser } from "./auth-user";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (!isFirebaseConfigured()) {
    return { response, user: null as AppAuthUser | null };
  }

  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    return { response, user: null };
  }

  try {
    const user = await resolveUserFromSessionCookie(session);
    return { response, user };
  } catch {
    return { response, user: null };
  }
}
