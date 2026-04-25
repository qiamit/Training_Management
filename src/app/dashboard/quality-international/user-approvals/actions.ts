"use server";

import { revalidatePath } from "next/cache";

import { upsertPublicUserProfile } from "@/lib/auth/provision";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const APPROVABLE_ROLES = [
  "super_admin",
  "tenant_admin",
  "quality_manager",
  "individual",
  "employee",
  "trainee",
] as const;

async function assertSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const appRole = String(user?.app_metadata?.role ?? "");
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

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      role,
      approval_status: "approved",
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const approvedUser = data.user;
  if (approvedUser?.email) {
    await upsertPublicUserProfile({
      authUserId: approvedUser.id,
      email: approvedUser.email,
      fullName: String(approvedUser.user_metadata?.full_name ?? ""),
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

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      approval_status: "rejected",
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/quality-international/user-approvals");
}
