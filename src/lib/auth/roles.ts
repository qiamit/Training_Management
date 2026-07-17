import type { AppRole } from "@/lib/supabase/types";
import type { DashboardNavItem } from "@/components/dashboard-shell";
import { BRAND } from "@/lib/brand";

export const LOGIN_ROLES = [
  "quality-international",
  "trainer",
  "organization",
  "individual",
] as const;

export type LoginRole = (typeof LOGIN_ROLES)[number];

export type QiWorkspaceMode = "admin" | "trainer";

export function isTrainerCapable(
  role: AppRole | string | null | undefined,
): boolean {
  return role === "trainer" || role === "super_admin" || role === "employee";
}

export function canUseQiModeSwitch(
  role: AppRole | string | null | undefined,
): boolean {
  return role === "super_admin" || role === "employee";
}

export function effectiveQiMode(
  role: AppRole | string | null | undefined,
  preferredMode: QiWorkspaceMode,
): QiWorkspaceMode {
  if (role === "trainer") return "trainer";
  return canUseQiModeSwitch(role) ? preferredMode : "admin";
}

/** Org admin & employee when acting as training learners */
export function isOrgLearnerRole(
  role: AppRole | string | null | undefined,
): boolean {
  return role === "org_employee" || role === "org_admin";
}

export type SignupFieldType = "text" | "email" | "tel" | "password" | "select";

export type SignupField = {
  name: string;
  label: string;
  type: SignupFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ value: string; label: string }>;
  fullWidth?: boolean;
  /** Column span on 12-column signup grids (default 6 = half row) */
  span?: 1 | 2 | 3 | 4 | 6 | 12;
};

export type RoleConfig = {
  heading: string;
  subheading: string;
  tagline: string;
  accent: "indigo" | "emerald" | "amber";
  allowedAppRoles: AppRole[];
  dashboardPath: string;
  loginPath: string;
  primaryRoleLabel: string;
  signupFields: SignupField[];
  navItems: DashboardNavItem[];
};

const qualityInternationalNav: DashboardNavItem[] = [
  {
    label: "Overview",
    href: "/dashboard/quality-international",
    icon: "QI",
  },
  {
    label: "Training Programmes",
    href: "/dashboard/quality-international/training-programmes",
    icon: "TR",
  },
  {
    label: "Training Requests",
    href: "/dashboard/quality-international/training-requests",
    icon: "RQ",
  },
  {
    label: "Assign Programmes",
    href: "/dashboard/quality-international/assign-programmes",
    icon: "AS",
  },
  {
    label: "Evaluation of Trainee",
    href: "/dashboard/quality-international/evaluation",
    icon: "EV",
  },
  {
    label: "Finance Management",
    href: "/dashboard/quality-international/finance",
    icon: "FI",
  },
  {
    label: "Trainers Profile",
    href: "/dashboard/quality-international/trainers",
    icon: "TR",
    userMenu: true,
  },
  {
    label: "QI Employees",
    href: "/dashboard/quality-international/qi-employees",
    icon: "QE",
    userMenu: true,
  },
  {
    label: "Organizations",
    href: "/dashboard/quality-international/organizations",
    icon: "OR",
    userMenu: true,
  },
  {
    label: "Individuals",
    href: "/dashboard/quality-international/individuals",
    icon: "IN",
    userMenu: true,
  },
  {
    label: "Company Setting",
    href: "/dashboard/quality-international/company-setting",
    icon: "CS",
    userMenu: true,
  },
];

/** Trainer sees delivery modules only — no admin / catalogue / finance */
const qiTrainerNav: DashboardNavItem[] = [
  {
    label: "Overview",
    href: "/dashboard/quality-international",
    icon: "QI",
  },
  {
    label: "Assign Programmes",
    href: "/dashboard/quality-international/assign-programmes",
    icon: "AS",
  },
  {
    label: "Evaluation of Trainee",
    href: "/dashboard/quality-international/evaluation",
    icon: "EV",
  },
];

const QI_TRAINER_BLOCKED_PATHS = [
  "/dashboard/quality-international/training-programmes",
  "/dashboard/quality-international/training-requests",
  "/dashboard/quality-international/organizations",
  "/dashboard/quality-international/individuals",
  "/dashboard/quality-international/finance",
  "/dashboard/quality-international/trainers",
  "/dashboard/quality-international/qi-employees",
  "/dashboard/quality-international/company-setting",
] as const;

export function isQiPathAllowedForRole(
  role: AppRole,
  pathname: string,
  mode: QiWorkspaceMode = "admin",
): boolean {
  if (effectiveQiMode(role, mode) !== "trainer") return true;
  return !QI_TRAINER_BLOCKED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

const organizationNav: DashboardNavItem[] = [
  {
    section: "Organization",
    label: "Dashboard",
    href: "/dashboard/organization",
    icon: "DB",
  },
  {
    section: "Organization",
    label: "Training Plan",
    href: "/dashboard/organization/training-plan",
    icon: "TP",
  },
  {
    section: "Organization",
    label: "Programme Request",
    href: "/dashboard/organization/programme-request",
    icon: "PR",
  },
  {
    section: "Organization",
    label: "Assigned Trainings",
    href: "/dashboard/organization/assigned-trainings",
    icon: "AT",
  },
  {
    section: "Organization",
    label: "Training Payment",
    href: "/dashboard/organization/training-payment",
    icon: "PY",
  },
  {
    section: "Organization",
    label: "Organization Employees",
    href: "/dashboard/organization/employees",
    icon: "EM",
    userMenu: true,
  },
  {
    section: "Organization",
    label: "Organization Details",
    href: "/dashboard/organization/details",
    icon: "OR",
    userMenu: true,
  },
  {
    section: "My Training",
    sectionDropdown: true,
    label: "My Dashboard",
    href: "/dashboard/organization/my-dashboard",
    icon: "MD",
  },
  {
    section: "My Training",
    sectionDropdown: true,
    label: "Ongoing Trainings",
    href: "/dashboard/organization/ongoing-trainings",
    icon: "OT",
  },
  {
    section: "My Training",
    sectionDropdown: true,
    label: "Training Evaluation",
    href: "/dashboard/organization/evaluations",
    icon: "EV",
  },
  {
    section: "My Training",
    sectionDropdown: true,
    label: "Certificates",
    href: "/dashboard/organization/certificates",
    icon: "CF",
  },
  {
    section: "My Training",
    sectionDropdown: true,
    label: "My Profile",
    href: "/dashboard/organization/profile",
    icon: "PF",
  },
];

const individualNav: DashboardNavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard/individual",
    icon: "DB",
  },
  {
    label: "Training Plan",
    href: "/dashboard/individual/training-plan",
    icon: "TP",
  },
  {
    label: "Programme Request",
    href: "/dashboard/individual/programme-request",
    icon: "PR",
  },
  {
    label: "Assigned Trainings",
    href: "/dashboard/individual/assigned-trainings",
    icon: "AT",
  },
  {
    label: "My Evaluations",
    href: "/dashboard/individual/evaluations",
    icon: "EV",
  },
  {
    label: "Completed Trainings",
    href: "/dashboard/individual/completed-trainings",
    icon: "CT",
  },
  {
    label: "Certificates",
    href: "/dashboard/individual/certificates",
    icon: "CF",
  },
  {
    label: "My Profile",
    href: "/dashboard/individual/profile",
    icon: "PF",
  },
];

/** Organization employee learner modules */
const orgEmployeeNav: DashboardNavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard/individual",
    icon: "DB",
  },
  {
    label: "Ongoing Trainings",
    href: "/dashboard/individual/assigned-trainings",
    icon: "OT",
  },
  {
    label: "Training Evaluation",
    href: "/dashboard/individual/evaluations",
    icon: "EV",
  },
  {
    label: "Certificates",
    href: "/dashboard/individual/certificates",
    icon: "CF",
  },
  {
    label: "My Profile",
    href: "/dashboard/individual/profile",
    icon: "PF",
  },
];

export const roleConfigMap: Record<LoginRole, RoleConfig> = {
  "quality-international": {
    heading: BRAND.shortName,
    subheading:
      "Sign in as platform staff to manage organizations, training catalogs, finance, and approvals.",
    tagline: "Service Provider Portal",
    accent: "indigo",
    allowedAppRoles: ["super_admin", "trainer", "employee"],
    dashboardPath: "/dashboard/quality-international",
    loginPath: "/login/quality-international",
    primaryRoleLabel: "QI Staff",
    signupFields: [
      {
        name: "fullName",
        label: "Full Name",
        type: "text",
        required: true,
        placeholder: "e.g. Priya Menon",
      },
      {
        name: "designation",
        label: "Designation",
        type: "text",
        required: true,
        placeholder: "e.g. Quality Director",
      },
      {
        name: "email",
        label: "Work Email",
        type: "email",
        required: true,
        placeholder: BRAND.email,
      },
      {
        name: "mobile",
        label: "Mobile Number",
        type: "tel",
        required: true,
        placeholder: "+91 98xxxxxxxx",
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
        placeholder: "Minimum 8 characters",
        fullWidth: true,
        helpText:
          "QI accounts require approval by a super admin (unless bootstrap email).",
      },
    ],
    navItems: qualityInternationalNav,
  },
  trainer: {
    heading: "Trainer Portal",
    subheading:
      "Sign in as a trainer to deliver programmes, manage sessions, and support evaluations.",
    tagline: "Trainer Workspace",
    accent: "indigo",
    allowedAppRoles: ["trainer"],
    dashboardPath: "/dashboard/quality-international",
    loginPath: "/login/trainer",
    primaryRoleLabel: "Trainer",
    signupFields: [
      {
        name: "fullName",
        label: "Full Name",
        type: "text",
        required: true,
        placeholder: "e.g. Rahul Sharma",
      },
      {
        name: "designation",
        label: "Designation",
        type: "text",
        required: true,
        placeholder: "e.g. Lead Trainer",
      },
      {
        name: "email",
        label: "Work Email",
        type: "email",
        required: true,
        placeholder: "trainer@qualityinternational.in",
      },
      {
        name: "mobile",
        label: "Mobile Number",
        type: "tel",
        required: true,
        placeholder: "+91 98xxxxxxxx",
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
        placeholder: "Minimum 8 characters",
        fullWidth: true,
        helpText:
          "Trainer accounts are usually created by QI admin. Self-signup needs approval.",
      },
    ],
    navItems: qiTrainerNav,
  },
  organization: {
    heading: "Organization Portal",
    subheading: "",
    tagline: "Tenant Workspace",
    accent: "emerald",
    allowedAppRoles: ["org_admin", "org_employee"],
    dashboardPath: "/dashboard/organization",
    loginPath: "/login/organization",
    primaryRoleLabel: "Organization User",
    signupFields: [
      {
        name: "organizationName",
        label: "Organization Name",
        type: "text",
        required: true,
        fullWidth: true,
        span: 12,
      },
      {
        name: "gstNumber",
        label: "GST Number",
        type: "text",
        required: true,
        span: 3,
      },
      {
        name: "industry",
        label: "Type of Industry",
        type: "select",
        required: true,
        span: 3,
        options: [
          { value: "testing_laboratory", label: "Testing Laboratory" },
          { value: "pharma", label: "Pharmaceutical" },
          { value: "manufacturing", label: "Manufacturing" },
          { value: "healthcare", label: "Healthcare" },
          { value: "energy", label: "Energy & Utilities" },
          { value: "it", label: "IT & Software" },
          { value: "education", label: "Education" },
          { value: "other", label: "Other" },
        ],
      },
      {
        name: "employeeCount",
        label: "Number of Employees",
        type: "select",
        required: true,
        span: 3,
        options: [
          { value: "1-50", label: "1 - 50" },
          { value: "51-200", label: "51 - 200" },
          { value: "201-1000", label: "201 - 1,000" },
          { value: "1000+", label: "1,000+" },
        ],
      },
      {
        name: "designation",
        label: "Designation",
        type: "text",
        required: true,
        span: 3,
      },
      {
        name: "fullName",
        label: "Contact Person Name",
        type: "text",
        required: true,
        span: 4,
      },
      {
        name: "email",
        label: "Email Address",
        type: "email",
        required: true,
        span: 4,
      },
      {
        name: "mobile",
        label: "Mobile Number",
        type: "tel",
        required: true,
        span: 4,
      },
      {
        name: "address",
        label: "Address",
        type: "text",
        required: true,
        fullWidth: true,
        span: 12,
      },
      {
        name: "city",
        label: "City",
        type: "text",
        required: true,
        span: 3,
      },
      {
        name: "pinCode",
        label: "PIN Code",
        type: "text",
        required: true,
        span: 3,
      },
      {
        name: "state",
        label: "State",
        type: "text",
        required: true,
        span: 3,
      },
      {
        name: "country",
        label: "Country",
        type: "text",
        required: true,
        span: 3,
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
        span: 6,
      },
      {
        name: "confirmPassword",
        label: "Retype Password",
        type: "password",
        required: true,
        span: 6,
      },
    ],
    navItems: organizationNav,
  },
  individual: {
    heading: "Individual Learner Portal",
    subheading:
      "Sign in as an independent learner to enroll in programmes, attempt assessments, and download certificates.",
    tagline: "Learner Workspace",
    accent: "amber",
    allowedAppRoles: ["individual"],
    dashboardPath: "/dashboard/individual",
    loginPath: "/login/individual",
    primaryRoleLabel: "Individual Learner",
    signupFields: [
      {
        name: "fullName",
        label: "Full Name",
        type: "text",
        required: true,
        placeholder: "Your full name (as on ID)",
      },
      {
        name: "dateOfBirth",
        label: "Date of Birth",
        type: "text",
        required: false,
        placeholder: "DD-MM-YYYY",
      },
      {
        name: "email",
        label: "Email Address",
        type: "email",
        required: true,
        placeholder: "you@example.com",
      },
      {
        name: "mobile",
        label: "Mobile Number",
        type: "tel",
        required: true,
        placeholder: "+91 98xxxxxxxx",
      },
      {
        name: "occupation",
        label: "Occupation",
        type: "text",
        required: false,
        placeholder: "e.g. Lab Technician, Student",
      },
      {
        name: "qualification",
        label: "Qualification",
        type: "text",
        required: false,
        placeholder: "e.g. B.Sc, Diploma",
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
        placeholder: "Minimum 8 characters",
        fullWidth: true,
      },
    ],
    navItems: individualNav,
  },
};

export const roleLabels: Record<AppRole, string> = {
  super_admin: "Super Administrator",
  trainer: "Trainer",
  employee: "QI Employee",
  org_admin: "Organization Admin",
  org_employee: "Organization Employee",
  individual: "Individual Learner",
};

export function portalForRole(role: AppRole): LoginRole {
  if (role === "trainer") {
    return "trainer";
  }
  if (role === "super_admin" || role === "employee") {
    return "quality-international";
  }
  if (role === "org_admin" || role === "org_employee") {
    return "organization";
  }
  return "individual";
}

export function dashboardPathForRole(role: AppRole): string {
  if (role === "org_employee") {
    return "/dashboard/individual";
  }
  return roleConfigMap[portalForRole(role)].dashboardPath;
}

/** Org employees use learner nav; trainer mode uses limited QI delivery nav. */
export function navForProfile(
  role: AppRole,
  qiMode: QiWorkspaceMode = "admin",
): DashboardNavItem[] {
  if (role === "org_employee") {
    return orgEmployeeNav;
  }
  if (role === "individual") {
    return individualNav;
  }
  if (role === "org_admin") {
    return organizationNav;
  }
  if (effectiveQiMode(role, qiMode) === "trainer") {
    return qiTrainerNav;
  }
  return qualityInternationalNav;
}
