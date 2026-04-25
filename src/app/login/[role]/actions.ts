"use server";

import { redirect } from "next/navigation";

import {
  isLoginRole,
  roleConfigMap,
  type LoginRole,
} from "@/lib/auth/roles";
import {
  upsertPublicUserProfile,
  type ExtendedProfile,
} from "@/lib/auth/provision";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(buildErrorRedirect(role, "Invalid email or password."));
  }

  let userRole = String(data.user.app_metadata?.role ?? "");
  const approvalStatus = String(data.user.app_metadata?.approval_status ?? "");

  if (approvalStatus === "rejected") {
    await supabase.auth.signOut();
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
      const admin = createAdminClient();
      const { error: updateError } = await admin.auth.admin.updateUserById(
        data.user.id,
        {
          app_metadata: {
            role: defaultRole,
            approval_status: "approved",
          },
        },
      );

      if (!updateError) {
        userRole = defaultRole;
      }
    } catch {
      // Keep default flow below if admin client is not available.
    }
  }

  if (!userRole) {
    await supabase.auth.signOut();
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
    await supabase.auth.signOut();
    redirect(
      buildErrorRedirect(
        role,
        "Your account is not authorized for this login portal.",
      ),
    );
  }

  if (role === "individual" || role === "organization") {
    try {
      await upsertPublicUserProfile({
        authUserId: data.user.id,
        email: data.user.email ?? email,
        fullName: String(data.user.user_metadata?.full_name ?? ""),
        role: userRole as
          | "tenant_admin"
          | "quality_manager"
          | "individual"
          | "employee"
          | "trainee",
        portal: role,
        profile: {
          designation: String(data.user.user_metadata?.designation ?? "") || undefined,
          mobile: String(data.user.user_metadata?.mobile ?? "") || undefined,
          organizationName:
            String(data.user.user_metadata?.organization_name ?? "") || undefined,
          city: String(data.user.user_metadata?.city ?? "") || undefined,
          country: String(data.user.user_metadata?.country ?? "") || undefined,
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

  const supabase = await createClient();
  const emailRedirectTo = `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(
    `/login/${role}`,
  )}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
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
      },
    },
  });

  if (error) {
    redirect(buildSignupErrorRedirect(role, error.message));
  }

  if ((role === "individual" || role === "organization") && data.user?.id) {
    const defaultRole = role === "organization" ? "tenant_admin" : "individual";
    try {
      const admin = createAdminClient();
      const { error: updateError } = await admin.auth.admin.updateUserById(
        data.user.id,
        {
          app_metadata: {
            role: defaultRole,
            approval_status: "approved",
          },
        },
      );

      if (updateError) {
        redirect(buildSignupErrorRedirect(role, updateError.message));
      }

      await upsertPublicUserProfile({
        authUserId: data.user.id,
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
        ? "Signup successful. Verify your email, then sign in."
        : "Signup request submitted. Verify your email and wait for admin approval before signing in.",
    ),
  );
}
