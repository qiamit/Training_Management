"use server";

import { redirect } from "next/navigation";

import {
  isLoginRole,
  roleConfigMap,
  type LoginRole,
} from "@/lib/auth/roles";
import { isBootstrapSuperAdminEmail } from "@/lib/auth/bootstrap";
import {
  upsertPublicUserProfile,
  type ExtendedProfile,
} from "@/lib/auth/provision";
import { getAppRole } from "@/lib/firebase/auth-user";
import {
  getUserById,
  setSessionCookie,
  setUserClaims,
  signInWithEmailPassword,
  signOutCurrentUser,
  signUpWithEmailPassword,
  updateAuthProfile,
} from "@/lib/firebase/auth-server";
import { saveSignupMeta } from "@/lib/firebase/db";

function buildErrorRedirect(role: LoginRole, message: string) {
  const params = new URLSearchParams({ error: message });
  return `/login/${role}?${params.toString()}`;
}

function buildSuccessRedirect(role: LoginRole, message: string) {
  const params = new URLSearchParams({ mode: "signup", success: message });
  return `/login/${role}?${params.toString()}`;
}

function buildSignupErrorRedirect(role: LoginRole, message: string) {
  const params = new URLSearchParams({ mode: "signup", error: message });
  return `/login/${role}?${params.toString()}`;
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function extractExtendedProfile(formData: FormData): ExtendedProfile {
  return {
    designation: readString(formData, "designation") || undefined,
    mobile: readString(formData, "mobile") || undefined,
    organizationName: readString(formData, "organizationName") || undefined,
    industry: readString(formData, "industry") || undefined,
    employeeCount: readString(formData, "employeeCount") || undefined,
    city: readString(formData, "city") || undefined,
    country: readString(formData, "country") || undefined,
    occupation: readString(formData, "occupation") || undefined,
    qualification: readString(formData, "qualification") || undefined,
    dateOfBirth: readString(formData, "dateOfBirth") || undefined,
  };
}

export async function loginWithRole(role: LoginRole, formData: FormData) {
  if (!isLoginRole(role)) {
    redirect("/");
  }

  const email = readString(formData, "email");
  const password = String(formData.get("password") ?? "");
  const config = roleConfigMap[role];

  if (!email || !password) {
    redirect(buildErrorRedirect(role, "Email and password are required."));
  }

  let authResult: { idToken: string; localId: string };
  try {
    authResult = await signInWithEmailPassword(email, password);
  } catch {
    redirect(buildErrorRedirect(role, "Invalid email or password."));
  }

  const data = await getUserById(authResult.localId);

  if (!data) {
    redirect(buildErrorRedirect(role, "Invalid email or password."));
  }

  const isBootstrapAdmin =
    role === "quality-international" && isBootstrapSuperAdminEmail(email);

  // Bootstrap super admins: no approval queue, always super_admin.
  if (isBootstrapAdmin) {
    try {
      await setUserClaims(data.id, {
        role: "super_admin",
        approval_status: "approved",
      });
      await upsertPublicUserProfile({
        authUserId: data.id,
        email,
        fullName: String(data.user_metadata?.full_name ?? ""),
        role: "super_admin",
        portal: "quality-international",
      });
    } catch {
      // Login still succeeds — session enrichment treats bootstrap emails as super_admin.
    }

    try {
      authResult = await signInWithEmailPassword(email, password);
    } catch {
      redirect(
        buildErrorRedirect(role, "Signed in but session refresh failed. Try again."),
      );
    }

    await setSessionCookie(authResult.idToken);
    redirect(config.dashboardPath);
  }

  let userRole = getAppRole(data);
  const approvalStatus = String(data.app_metadata?.approval_status ?? "");
  let claimsWereUpdated = false;

  if (approvalStatus === "rejected") {
    redirect(
      buildErrorRedirect(
        role,
        "Your signup request was rejected. Contact your administrator.",
      ),
    );
  }

  if (!userRole && (role === "individual" || role === "organization")) {
    const defaultRole = role === "organization" ? "tenant_admin" : "individual";
    try {
      await setUserClaims(data.id, {
        role: defaultRole,
        approval_status: "approved",
      });
      userRole = defaultRole;
      claimsWereUpdated = true;
    } catch {
      // Keep default flow below if admin client is not available.
    }
  }

  if (!userRole) {
    redirect(
      buildErrorRedirect(
        role,
        role === "quality-international"
          ? "Your account is pending admin approval. Please try again after approval."
          : "Unable to provision your role automatically. Please contact support.",
      ),
    );
  }

  if (!config.allowedAppRoles.includes(userRole)) {
    redirect(
      buildErrorRedirect(
        role,
        "Your account is not authorized for this login portal.",
      ),
    );
  }

  if (claimsWereUpdated) {
    try {
      authResult = await signInWithEmailPassword(email, password);
    } catch {
      redirect(buildErrorRedirect(role, "Signed in but session refresh failed. Try again."));
    }
  }

  await setSessionCookie(authResult.idToken);

  if (role === "individual" || role === "organization") {
    try {
      await upsertPublicUserProfile({
        authUserId: data.id,
        email: data.email ?? email,
        fullName: String(data.user_metadata?.full_name ?? ""),
        role: userRole as
          | "tenant_admin"
          | "quality_manager"
          | "individual"
          | "employee"
          | "trainee",
        portal: role,
        profile: {
          designation: data.user_metadata?.designation,
          mobile: data.user_metadata?.mobile,
          organizationName: data.user_metadata?.organization_name,
          city: data.user_metadata?.city,
          country: data.user_metadata?.country,
        },
      });
    } catch {
      // Keep login successful even if profile sync temporarily fails.
    }
  }

  redirect(config.dashboardPath);
}

export async function signupWithRole(role: LoginRole, formData: FormData) {
  if (!isLoginRole(role)) {
    redirect("/");
  }

  const email = readString(formData, "email");
  const password = String(formData.get("password") ?? "");
  const fullName = readString(formData, "fullName");
  const profile = extractExtendedProfile(formData);

  if (!email || !password) {
    redirect(buildSignupErrorRedirect(role, "Email and password are required."));
  }

  if (password.length < 8) {
    redirect(
      buildSignupErrorRedirect(role, "Password must be at least 8 characters."),
    );
  }

  if (role === "organization" && !profile.organizationName) {
    redirect(
      buildSignupErrorRedirect(role, "Organization name is required."),
    );
  }

  if (
    (role === "individual" || role === "organization") &&
    !profile.mobile
  ) {
    redirect(buildSignupErrorRedirect(role, "Mobile number is required."));
  }

  let signUpResult: { idToken: string; localId: string };
  try {
    signUpResult = await signUpWithEmailPassword(email, password);
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Signup failed.";
    redirect(buildSignupErrorRedirect(role, message));
  }

  const continueUrl = `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(
    `/login/${role}`,
  )}`;

  if (fullName) {
    try {
      await updateAuthProfile(signUpResult.localId, { displayName: fullName });
    } catch {
      // Non-blocking.
    }
  }

  await saveSignupMeta(signUpResult.localId, {
    full_name: fullName || undefined,
    requested_portal: role,
    designation: profile.designation,
    mobile: profile.mobile,
    organization_name: profile.organizationName,
    industry: profile.industry,
    employee_count: profile.employeeCount,
    city: profile.city,
    country: profile.country,
    occupation: profile.occupation,
    qualification: profile.qualification,
    date_of_birth: profile.dateOfBirth,
  });

  if (role === "quality-international" && isBootstrapSuperAdminEmail(email)) {
    try {
      await setUserClaims(signUpResult.localId, {
        role: "super_admin",
        approval_status: "approved",
      });
      await upsertPublicUserProfile({
        authUserId: signUpResult.localId,
        email,
        fullName,
        role: "super_admin",
        portal: "quality-international",
        profile,
      });
    } catch {
      // Non-blocking — login path also provisions bootstrap admins.
    }

    redirect(
      buildSuccessRedirect(
        role,
        "Account created. Verify your email if prompted, then sign in.",
      ),
    );
  }

  if ((role === "individual" || role === "organization") && signUpResult.localId) {
    const defaultRole = role === "organization" ? "tenant_admin" : "individual";
    try {
      await setUserClaims(signUpResult.localId, {
        role: defaultRole,
        approval_status: "approved",
      });

      await upsertPublicUserProfile({
        authUserId: signUpResult.localId,
        email,
        fullName,
        role: defaultRole,
        portal: role,
        profile,
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to auto-approve signup.";
      redirect(buildSignupErrorRedirect(role, message));
    }
  }

  redirect(
    buildSuccessRedirect(
      role,
      role === "individual" || role === "organization"
        ? `Signup successful. Check your email to verify (${continueUrl}), then sign in.`
        : "Signup request submitted. Verify your email and wait for admin approval before signing in.",
    ),
  );
}
