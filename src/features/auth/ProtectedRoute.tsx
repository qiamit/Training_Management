import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  dashboardPathForRole,
  portalForRole,
  type LoginRole,
} from "@/lib/auth/roles";

export function ProtectedRoute({ portal }: { portal: LoginRole }) {
  const { loading, session, profile, assertPortalAccess } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Loading session…
      </div>
    );
  }

  if (!session || !profile) {
    const loginPortal =
      portal === "quality-international" ? "quality-international" : portal;
    return (
      <Navigate
        to={`/login/${loginPortal}`}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // Org employees use learner dashboard routes
  if (portal === "organization" && profile.role === "org_employee") {
    return <Navigate to="/dashboard/individual" replace />;
  }

  if (portal === "individual" && profile.role === "org_employee") {
    // allowed — learner UI
  } else if (
    portal === "quality-international" &&
    profile.role === "trainer"
  ) {
    // Trainers use QI dashboard after Trainer Login
  } else {
    const err = assertPortalAccess(portal);
    if (err) {
      const correct = portalForRole(profile.role);
      if (correct !== portal) {
        return <Navigate to={dashboardPathForRole(profile.role)} replace />;
      }
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 px-4 text-center">
          <p className="text-sm font-medium text-slate-800">{err}</p>
          <a href="/" className="text-sm text-indigo-600 underline">
            Back to home
          </a>
        </div>
      );
    }
  }

  return <Outlet />;
}
