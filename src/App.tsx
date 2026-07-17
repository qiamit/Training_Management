import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/login/LoginPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import {
  IndividualDashboardLayout,
  OrgDashboardLayout,
  QiDashboardLayout,
} from "@/pages/dashboard/layouts";
import {
  QiIndividualWorkspaceLayout,
  QiOrgWorkspaceLayout,
} from "@/pages/dashboard/workspace-layouts";
import {
  QiAssignProgrammesPage,
  QiCompanySettingsPage,
  QiEvaluationPage,
  QiFinancePage,
  QiIndividualsPage,
  QiOrganizationsPage,
  QiOverviewPage,
  QiProgrammesPage,
  QiEmployeesPage,
  QiTrainersPage,
  QiTrainingRequestsPage,
} from "@/pages/dashboard/quality-international/pages";
import {
  OrgAssignedTrainingsPage,
  OrgDetailsPage,
  OrgEmployeesPage,
  OrgOverviewPage,
  OrgProgrammeRequestPage,
  OrgTrainingPlanPage,
} from "@/pages/dashboard/organization/pages";
import { OrgTrainingPaymentPage } from "@/pages/dashboard/organization/training-payment-page";
import {
  IndividualAssignedTrainingsPage,
  IndividualCertificatesPage,
  IndividualCompletedTrainingsPage,
  IndividualOverviewPage,
  IndividualProfilePage,
  IndividualProgrammeRequestPage,
  IndividualSessionsPage,
  IndividualTrainingPlanPage,
} from "@/pages/dashboard/individual/pages";
import { TraineeEvaluationsPage } from "@/pages/dashboard/evaluation-pages";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login/:role" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route element={<ProtectedRoute portal="quality-international" />}>
        <Route
          path="/dashboard/quality-international"
          element={<QiDashboardLayout />}
        >
          <Route index element={<QiOverviewPage />} />
          <Route
            path="assign-programmes"
            element={<QiAssignProgrammesPage />}
          />
          <Route path="evaluation" element={<QiEvaluationPage />} />
          <Route path="organizations" element={<QiOrganizationsPage />} />
          <Route path="individuals" element={<QiIndividualsPage />} />
          <Route path="training-programmes" element={<QiProgrammesPage />} />
          <Route
            path="sessions"
            element={
              <Navigate
                to="/dashboard/quality-international/assign-programmes"
                replace
              />
            }
          />
          <Route
            path="training-requests"
            element={<QiTrainingRequestsPage />}
          />
          <Route path="finance" element={<QiFinancePage />} />
          <Route path="trainers" element={<QiTrainersPage />} />
          <Route path="qi-employees" element={<QiEmployeesPage />} />
          <Route
            path="user-approvals"
            element={
              <Navigate
                to="/dashboard/quality-international/trainers"
                replace
              />
            }
          />
          <Route path="company-setting" element={<QiCompanySettingsPage />} />
        </Route>

        <Route
          path="/dashboard/quality-international/org-workspace/:orgId"
          element={<QiOrgWorkspaceLayout />}
        >
          <Route index element={<OrgOverviewPage />} />
          <Route path="employees" element={<OrgEmployeesPage />} />
          <Route path="details" element={<OrgDetailsPage />} />
          <Route path="training-plan" element={<OrgTrainingPlanPage />} />
          <Route
            path="programme-request"
            element={<OrgProgrammeRequestPage />}
          />
          <Route
            path="assigned-trainings"
            element={<OrgAssignedTrainingsPage />}
          />
          <Route
            path="training-payment"
            element={<OrgTrainingPaymentPage />}
          />
          <Route path="evaluations" element={<TraineeEvaluationsPage />} />
        </Route>

        <Route
          path="/dashboard/quality-international/individual-workspace/:userId"
          element={<QiIndividualWorkspaceLayout />}
        >
          <Route index element={<IndividualOverviewPage />} />
          <Route
            path="training-plan"
            element={<IndividualTrainingPlanPage />}
          />
          <Route
            path="programme-request"
            element={<IndividualProgrammeRequestPage />}
          />
          <Route
            path="assigned-trainings"
            element={<IndividualAssignedTrainingsPage />}
          />
          <Route path="evaluations" element={<TraineeEvaluationsPage />} />
          <Route
            path="completed-trainings"
            element={<IndividualCompletedTrainingsPage />}
          />
          <Route
            path="certificates"
            element={<IndividualCertificatesPage />}
          />
          <Route path="sessions" element={<IndividualSessionsPage />} />
          <Route path="profile" element={<IndividualProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute portal="organization" />}>
        <Route path="/dashboard/organization" element={<OrgDashboardLayout />}>
          <Route index element={<OrgOverviewPage />} />
          <Route path="employees" element={<OrgEmployeesPage />} />
          <Route path="details" element={<OrgDetailsPage />} />
          <Route path="training-plan" element={<OrgTrainingPlanPage />} />
          <Route
            path="programme-request"
            element={<OrgProgrammeRequestPage />}
          />
          <Route
            path="assigned-trainings"
            element={<OrgAssignedTrainingsPage />}
          />
          <Route
            path="training-payment"
            element={<OrgTrainingPaymentPage />}
          />
          <Route
            path="my-dashboard"
            element={<IndividualOverviewPage />}
          />
          <Route
            path="ongoing-trainings"
            element={<IndividualAssignedTrainingsPage />}
          />
          <Route path="evaluations" element={<TraineeEvaluationsPage />} />
          <Route
            path="certificates"
            element={<IndividualCertificatesPage />}
          />
          <Route path="profile" element={<IndividualProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute portal="individual" />}>
        <Route
          path="/dashboard/individual"
          element={<IndividualDashboardLayout />}
        >
          <Route index element={<IndividualOverviewPage />} />
          <Route
            path="training-plan"
            element={<IndividualTrainingPlanPage />}
          />
          <Route
            path="programme-request"
            element={<IndividualProgrammeRequestPage />}
          />
          <Route
            path="assigned-trainings"
            element={<IndividualAssignedTrainingsPage />}
          />
          <Route path="evaluations" element={<TraineeEvaluationsPage />} />
          <Route
            path="completed-trainings"
            element={<IndividualCompletedTrainingsPage />}
          />
          <Route
            path="certificates"
            element={<IndividualCertificatesPage />}
          />
          <Route path="sessions" element={<IndividualSessionsPage />} />
          <Route path="profile" element={<IndividualProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
