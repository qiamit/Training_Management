import type { DashboardNavItem } from "@/components/dashboard-shell";

export const LOGIN_ROLES = [
  "quality-international",
  "organization",
  "individual",
] as const;

export type LoginRole = (typeof LOGIN_ROLES)[number];

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
};

export type RoleConfig = {
  heading: string;
  subheading: string;
  tagline: string;
  accent: "indigo" | "emerald" | "amber";
  allowedAppRoles: string[];
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
    description: "Control center",
    icon: "QI",
  },
  {
    label: "Organizations",
    href: "/dashboard/quality-international/organizations",
    description: "All tenants",
    icon: "OR",
  },
  {
    label: "Individuals",
    href: "/dashboard/quality-international/individuals",
    description: "Independent learners",
    icon: "IN",
  },
  {
    label: "Training Programmes",
    href: "/dashboard/quality-international/training-programmes",
    description: "Catalog & schedule",
    icon: "TR",
  },
  {
    label: "Finance",
    href: "/dashboard/quality-international/finance",
    description: "Invoices & revenue",
    icon: "FI",
  },
  {
    label: "User Approvals",
    href: "/dashboard/quality-international/user-approvals",
    description: "Pending signups",
    icon: "AP",
  },
];

const organizationNav: DashboardNavItem[] = [
  {
    label: "Overview",
    href: "/dashboard/organization",
    description: "Workspace home",
    icon: "OV",
  },
  {
    label: "Employees",
    href: "/dashboard/organization/employees",
    description: "Manage learners",
    icon: "EM",
  },
  {
    label: "Organization Details",
    href: "/dashboard/organization/details",
    description: "Profile & settings",
    icon: "OR",
  },
  {
    label: "Training Plan",
    href: "/dashboard/organization/training-plan",
    description: "Schedule & requests",
    icon: "TP",
  },
];

const individualNav: DashboardNavItem[] = [
  {
    label: "Overview",
    href: "/dashboard/individual",
    description: "Learner home",
    icon: "OV",
  },
  {
    label: "My Sessions",
    href: "/dashboard/individual/sessions",
    description: "Upcoming & past",
    icon: "SE",
  },
  {
    label: "Assessments",
    href: "/dashboard/individual/assessments",
    description: "Quizzes & scores",
    icon: "AS",
  },
  {
    label: "Certificates",
    href: "/dashboard/individual/certificates",
    description: "Issued credentials",
    icon: "CE",
  },
];

export const roleConfigMap: Record<LoginRole, RoleConfig> = {
  "quality-international": {
    heading: "Quality International",
    subheading:
      "Sign in as platform administrator to manage all organizations, training catalogs, finance, and compliance analytics.",
    tagline: "Service Provider Portal",
    accent: "indigo",
    allowedAppRoles: ["super_admin"],
    dashboardPath: "/dashboard/quality-international",
    loginPath: "/login/quality-international",
    primaryRoleLabel: "Super Administrator",
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
        placeholder: "name@qualityinternational.in",
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
          "Quality International accounts require explicit approval by an existing super admin after email verification.",
      },
    ],
    navItems: qualityInternationalNav,
  },
  organization: {
    heading: "Organization Portal",
    subheading:
      "Sign in as a tenant administrator or quality manager to onboard employees, plan trainings, and track competency.",
    tagline: "Tenant Workspace",
    accent: "emerald",
    allowedAppRoles: ["tenant_admin", "quality_manager"],
    dashboardPath: "/dashboard/organization",
    loginPath: "/login/organization",
    primaryRoleLabel: "Tenant Administrator",
    signupFields: [
      {
        name: "organizationName",
        label: "Organization Name",
        type: "text",
        required: true,
        placeholder: "e.g. Acme Pharma Pvt Ltd",
        fullWidth: true,
      },
      {
        name: "industry",
        label: "Industry",
        type: "select",
        required: true,
        options: [
          { value: "", label: "Select industry" },
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
        label: "Employees",
        type: "select",
        required: true,
        options: [
          { value: "", label: "Headcount" },
          { value: "1-50", label: "1 - 50" },
          { value: "51-200", label: "51 - 200" },
          { value: "201-1000", label: "201 - 1,000" },
          { value: "1000+", label: "1,000+" },
        ],
      },
      {
        name: "fullName",
        label: "Contact Person Name",
        type: "text",
        required: true,
        placeholder: "Primary contact full name",
      },
      {
        name: "designation",
        label: "Designation",
        type: "text",
        required: true,
        placeholder: "e.g. HR Head, Quality Manager",
      },
      {
        name: "email",
        label: "Work Email",
        type: "email",
        required: true,
        placeholder: "contact@company.com",
      },
      {
        name: "mobile",
        label: "Mobile Number",
        type: "tel",
        required: true,
        placeholder: "+91 98xxxxxxxx",
      },
      {
        name: "country",
        label: "Country",
        type: "text",
        required: true,
        placeholder: "e.g. India",
      },
      {
        name: "city",
        label: "City",
        type: "text",
        required: true,
        placeholder: "e.g. Bengaluru",
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
    navItems: organizationNav,
  },
  individual: {
    heading: "Individual Learner Portal",
    subheading:
      "Sign in as an independent learner to enroll in training programmes, attempt evaluations, and download verifiable certificates.",
    tagline: "Learner Workspace",
    accent: "amber",
    allowedAppRoles: ["individual", "employee", "trainee"],
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
        label: "Highest Qualification",
        type: "select",
        required: false,
        options: [
          { value: "", label: "Select qualification" },
          { value: "high_school", label: "High School" },
          { value: "diploma", label: "Diploma" },
          { value: "bachelor", label: "Bachelor's Degree" },
          { value: "master", label: "Master's Degree" },
          { value: "doctorate", label: "Doctorate" },
          { value: "other", label: "Other" },
        ],
      },
      {
        name: "country",
        label: "Country",
        type: "text",
        required: true,
        placeholder: "e.g. India",
      },
      {
        name: "city",
        label: "City",
        type: "text",
        required: true,
        placeholder: "e.g. Chennai",
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

export function isLoginRole(value: string): value is LoginRole {
  return LOGIN_ROLES.includes(value as LoginRole);
}

export function resolveDashboardFromAppRole(appRole: string | undefined): string {
  if (!appRole) {
    return "/";
  }

  const match = Object.values(roleConfigMap).find((entry) =>
    entry.allowedAppRoles.includes(appRole),
  );

  return match?.dashboardPath ?? "/";
}

export function appRoleLabel(appRole: string | undefined): string {
  switch (appRole) {
    case "super_admin":
      return "Super Admin";
    case "tenant_admin":
      return "Tenant Admin";
    case "quality_manager":
      return "Quality Manager";
    case "individual":
      return "Individual";
    case "employee":
      return "Employee";
    case "trainee":
      return "Trainee";
    default:
      return "User";
  }
}
