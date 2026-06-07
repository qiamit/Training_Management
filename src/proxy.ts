import { NextResponse, type NextRequest } from "next/server";

import { getAppRole } from "@/lib/firebase/auth-user";
import { updateSession } from "@/lib/firebase/session-proxy";
import { resolveDashboardFromAppRole } from "@/lib/auth/roles";

const DASHBOARD_PREFIX = "/dashboard";

function dashboardForPath(pathname: string) {
  if (pathname.startsWith("/dashboard/quality-international")) {
    return "/dashboard/quality-international";
  }
  if (pathname.startsWith("/dashboard/organization")) {
    return "/dashboard/organization";
  }
  if (
    pathname.startsWith("/dashboard/individual") ||
    pathname.startsWith("/dashboard/employee")
  ) {
    return "/dashboard/individual";
  }
  return DASHBOARD_PREFIX;
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (pathname === "/login/employee") {
    return NextResponse.redirect(new URL("/login/individual", request.url));
  }

  if (pathname === "/dashboard/employee") {
    return NextResponse.redirect(new URL("/dashboard/individual", request.url));
  }

  if (pathname.startsWith(DASHBOARD_PREFIX) && !user) {
    const loginTarget = dashboardForPath(pathname).replace("/dashboard", "/login");
    return NextResponse.redirect(new URL(loginTarget, request.url));
  }

  if (pathname === "/login" && user) {
    const appRole = getAppRole(user);
    const dashboardPath = resolveDashboardFromAppRole(appRole);
    return NextResponse.redirect(new URL(dashboardPath, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
