import { NextResponse, type NextRequest } from "next/server";

import { firebaseConfig } from "@/lib/firebase/config";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const mode = requestUrl.searchParams.get("mode");
  const oobCode = requestUrl.searchParams.get("oobCode");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (mode === "verifyEmail" && oobCode && firebaseConfig.apiKey) {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${firebaseConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oobCode }),
      },
    );

    if (response.ok) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  return NextResponse.redirect(
    new URL(
      "/login/quality-international?error=Invalid+or+expired+link",
      requestUrl.origin,
    ),
  );
}
