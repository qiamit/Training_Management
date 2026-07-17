import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@/features/auth/AuthProvider";

import type { Profile } from "@/lib/supabase/types";

export type WorkspacePreviewState =
  | {
      kind: "organization";
      orgId: string;
      label: string;
      backTo: string;
    }
  | {
      kind: "individual";
      userId: string;
      orgId: string | null;
      label: string;
      backTo: string;
      user: Profile;
    };

const WorkspacePreviewContext = createContext<WorkspacePreviewState | null>(
  null,
);

export function WorkspacePreviewProvider({
  value,
  children,
}: {
  value: WorkspacePreviewState;
  children: ReactNode;
}) {
  return (
    <WorkspacePreviewContext.Provider value={value}>
      {children}
    </WorkspacePreviewContext.Provider>
  );
}

export function useWorkspacePreview() {
  return useContext(WorkspacePreviewContext);
}

/** Effective organization id for data queries (preview or logged-in profile). */
export function useWorkspaceOrgId() {
  const preview = useWorkspacePreview();
  const { profile } = useAuth();
  if (preview?.kind === "organization") return preview.orgId;
  if (preview?.kind === "individual") return preview.orgId;
  return profile?.org_id ?? null;
}

/** Effective learner/user id for individual data queries. */
export function useWorkspaceUserId() {
  const preview = useWorkspacePreview();
  const { profile } = useAuth();
  if (preview?.kind === "individual") return preview.userId;
  return profile?.id ?? null;
}

/** Always the signed-in QI/org/individual actor (for audit fields). */
export function useWorkspaceActorId() {
  const { profile } = useAuth();
  return profile?.id ?? null;
}

export function useIsWorkspacePreview() {
  return Boolean(useWorkspacePreview());
}

/** QI/Trainer preview of org/individual dashboards is view-only. */
export function useWorkspaceReadOnly() {
  return Boolean(useWorkspacePreview());
}

export function useWorkspaceNavBase() {
  const preview = useWorkspacePreview();
  return useMemo(() => {
    if (!preview) return null;
    if (preview.kind === "organization") {
      return `/dashboard/quality-international/org-workspace/${preview.orgId}`;
    }
    return `/dashboard/quality-international/individual-workspace/${preview.userId}`;
  }, [preview]);
}

/**
 * Auth profile with workspace preview overrides so existing org/individual
 * pages load the selected tenant/learner without rewriting every query.
 */
export function useWorkspaceScopedProfile() {
  const auth = useAuth();
  const preview = useWorkspacePreview();
  const orgId = useWorkspaceOrgId();
  const userId = useWorkspaceUserId();

  const profile = useMemo(() => {
    if (!auth.profile) return null;
    if (!preview) return auth.profile;
    if (preview.kind === "organization") {
      return { ...auth.profile, org_id: orgId };
    }
    return {
      ...preview.user,
    };
  }, [auth.profile, orgId, preview, userId]);

  return { ...auth, profile };
}
