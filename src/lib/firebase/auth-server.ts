import { cookies } from "next/headers";

import { isBootstrapSuperAdminEmail } from "@/lib/auth/bootstrap";

import { getAdminAuth } from "./admin";
import { firebaseConfig, isFirebaseConfigured } from "./config";
import {
  decodedToAppAuthUser,
  getAppRole,
  toAppAuthUser,
  type AppAuthUser,
} from "./auth-user";
import { getUserProfileByAuthId, getUserProfileMeta } from "./db";

export const SESSION_COOKIE_NAME = "__session";
const SESSION_EXPIRES_MS = 60 * 60 * 24 * 5 * 1000;

type IdentityToolkitResponse = {
  idToken?: string;
  localId?: string;
  email?: string;
  error?: { message?: string };
};

async function identityToolkitRequest(
  endpoint: "signInWithPassword" | "signUp",
  body: Record<string, unknown>,
) {
  if (!firebaseConfig.apiKey) {
    throw new Error("Firebase API key is not configured.");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, returnSecureToken: true }),
    },
  );

  const data = (await response.json()) as IdentityToolkitResponse;
  if (!response.ok || !data.idToken || !data.localId) {
    throw new Error(data.error?.message ?? "Authentication request failed.");
  }

  return data as { idToken: string; localId: string; email?: string };
}

/** Session JWT may lag behind Admin custom claims — resolve role from server + bootstrap list. */
export async function enrichAppUser(user: AppAuthUser): Promise<AppAuthUser> {
  if (getAppRole(user)) {
    return user;
  }

  try {
    const record = await getAdminAuth().getUser(user.id);
    const fromAdmin = toAppAuthUser(record, user.user_metadata);
    if (getAppRole(fromAdmin)) {
      return fromAdmin;
    }
  } catch {
    // Continue to Firestore / bootstrap fallbacks.
  }

  try {
    const profile = await getUserProfileByAuthId(user.id);
    if (profile?.role) {
      return {
        ...user,
        app_metadata: {
          role: profile.role,
          approval_status: "approved",
        },
      };
    }
  } catch {
    // Continue.
  }

  if (user.email && isBootstrapSuperAdminEmail(user.email)) {
    return {
      ...user,
      app_metadata: {
        role: "super_admin",
        approval_status: "approved",
      },
    };
  }

  return user;
}

export async function resolveUserFromSessionCookie(
  session: string,
): Promise<AppAuthUser | null> {
  const decoded = await getAdminAuth().verifySessionCookie(session, true);
  const profileMeta = await getUserProfileMeta(decoded.uid);
  const user = decodedToAppAuthUser(decoded, profileMeta);
  return enrichAppUser(user);
}

export async function signInWithEmailPassword(email: string, password: string) {
  return identityToolkitRequest("signInWithPassword", { email, password });
}

export async function signUpWithEmailPassword(email: string, password: string) {
  return identityToolkitRequest("signUp", { email, password });
}

export async function createSessionCookie(idToken: string) {
  return getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRES_MS,
  });
}

export async function setSessionCookie(idToken: string) {
  const sessionCookie = await createSessionCookie(idToken);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_EXPIRES_MS / 1000,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<AppAuthUser | null> {
  if (!isFirebaseConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    return null;
  }

  try {
    return await resolveUserFromSessionCookie(session);
  } catch {
    return null;
  }
}

export async function getUserById(uid: string): Promise<AppAuthUser | null> {
  try {
    const record = await getAdminAuth().getUser(uid);
    const profileMeta = await getUserProfileMeta(uid);
    return enrichAppUser(toAppAuthUser(record, profileMeta));
  } catch {
    return null;
  }
}

export async function signOutCurrentUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (session) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(session);
      await getAdminAuth().revokeRefreshTokens(decoded.uid);
    } catch {
      // Session may already be invalid.
    }
  }
  await clearSessionCookie();
}

export async function setUserClaims(
  uid: string,
  claims: { role?: string; approval_status?: string },
) {
  const existing = await getAdminAuth().getUser(uid);
  const merged = {
    ...(existing.customClaims ?? {}),
    ...claims,
  };
  await getAdminAuth().setCustomUserClaims(uid, merged);
}

export async function updateAuthProfile(
  uid: string,
  data: { displayName?: string; email?: string },
) {
  await getAdminAuth().updateUser(uid, data);
}

export async function listAuthUsers(max = 200) {
  const result = await getAdminAuth().listUsers(max);
  return result.users;
}
