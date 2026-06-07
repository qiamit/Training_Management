"use server";

import { revalidatePath } from "next/cache";

import { upsertPublicUserProfile } from "@/lib/auth/provision";
import { getAppRole } from "@/lib/firebase/auth-user";
import {
  getCurrentUser,
  getUserById,
  listAuthUsers,
  setUserClaims,
} from "@/lib/firebase/auth-server";
import { getSignupMeta } from "@/lib/firebase/db";

const APPROVABLE_ROLES = [
  "super_admin",
  "tenant_admin",
  "quality_manager",
  "individual",
  "employee",
  "trainee",
] as const;

async function assertSuperAdmin() {
  const user = await getCurrentUser();
  const appRole = getAppRole(user ?? { id: "" });
  if (!user || appRole !== "super_admin") {
    throw new Error("Unauthorized action.");
  }
}

export async function approveUser(formData: FormData) {
  await assertSuperAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!userId || !APPROVABLE_ROLES.includes(role as (typeof APPROVABLE_ROLES)[number])) {
    throw new Error("Provide a valid user ID and role.");
  }

  await setUserClaims(userId, {
    role,
    approval_status: "approved",
  });

  const approvedUser = await getUserById(userId);
  const signupMeta = await getSignupMeta(userId);

  if (approvedUser?.email) {
    await upsertPublicUserProfile({
      authUserId: userId,
      email: approvedUser.email,
      fullName:
        signupMeta?.full_name ??
        String(approvedUser.user_metadata?.full_name ?? ""),
      role: role as
        | "super_admin"
        | "tenant_admin"
        | "quality_manager"
        | "individual"
        | "employee"
        | "trainee",
      portal:
        role === "super_admin"
          ? "quality-international"
          : role === "individual" || role === "employee" || role === "trainee"
            ? "individual"
            : "organization",
    });
  }

  revalidatePath("/dashboard/quality-international/user-approvals");
}

export async function rejectUser(formData: FormData) {
  await assertSuperAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    throw new Error("User ID is required.");
  }

  await setUserClaims(userId, {
    approval_status: "rejected",
  });

  revalidatePath("/dashboard/quality-international/user-approvals");
}
