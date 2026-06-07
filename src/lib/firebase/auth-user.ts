import type { DecodedIdToken } from "firebase-admin/auth";
import type { UserRecord } from "firebase-admin/auth";

/** Shape used across the app (maps Firebase custom claims + profile). */
export type AppAuthUser = {
  id: string;
  email?: string | null;
  app_metadata?: {
    role?: string;
    approval_status?: string;
  };
  user_metadata?: Record<string, string | undefined>;
  created_at?: string;
};

export function claimsFromUser(
  user: UserRecord | DecodedIdToken,
): AppAuthUser["app_metadata"] {
  const claims =
    "customClaims" in user
      ? (user.customClaims as Record<string, unknown> | undefined)
      : ((user as DecodedIdToken) as Record<string, unknown>);

  const role =
    typeof claims?.role === "string"
      ? claims.role
      : typeof (user as DecodedIdToken).role === "string"
        ? (user as DecodedIdToken).role
        : undefined;

  const approval_status =
    typeof claims?.approval_status === "string"
      ? claims.approval_status
      : typeof (user as DecodedIdToken).approval_status === "string"
        ? (user as DecodedIdToken).approval_status
        : undefined;

  return { role, approval_status };
}

export function toAppAuthUser(
  user: UserRecord,
  profileMeta?: Record<string, string | undefined>,
): AppAuthUser {
  return {
    id: user.uid,
    email: user.email,
    app_metadata: claimsFromUser(user),
    user_metadata: profileMeta,
    created_at: user.metadata.creationTime,
  };
}

export function decodedToAppAuthUser(
  decoded: DecodedIdToken,
  profileMeta?: Record<string, string | undefined>,
): AppAuthUser {
  return {
    id: decoded.uid,
    email: decoded.email,
    app_metadata: {
      role:
        typeof decoded.role === "string"
          ? decoded.role
          : claimsFromUser(decoded)?.role,
      approval_status:
        typeof decoded.approval_status === "string"
          ? decoded.approval_status
          : claimsFromUser(decoded)?.approval_status,
    },
    user_metadata: profileMeta,
  };
}

export function getAppRole(user: AppAuthUser) {
  return String(user.app_metadata?.role ?? "");
}
