export type AppRole =
  | "super_admin"
  | "trainer"
  | "employee"
  | "org_admin"
  | "org_employee"
  | "individual";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type OrgType = "platform" | "tenant" | "independent";

export type ProgrammeStatus = "draft" | "published" | "archived";

export type SessionStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type EnrollmentStatus =
  | "enrolled"
  | "attended"
  | "completed"
  | "dropped";

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export type Organization = {
  id: string;
  name: string;
  type: OrgType;
  industry: string | null;
  employee_count: string | null;
  iso_accreditations: string[];
  city: string | null;
  country: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_person_name: string | null;
  status: string;
  notes: string | null;
  gst_number: string | null;
  address: string | null;
  pin_code: string | null;
  state: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgAccreditation = {
  id: string;
  org_id: string;
  accreditation_name: string;
  certificate_number: string;
  validity_date: string | null;
  scope: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  org_id: string | null;
  full_name: string;
  role: AppRole;
  approval_status: ApprovalStatus;
  is_active: boolean;
  designation: string | null;
  mobile: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  state: string | null;
  pin_code: string | null;
  occupation: string | null;
  qualification: string | null;
  photo_url: string | null;
  education: string | null;
  experience: string | null;
  skills: string | null;
  date_of_birth: string | null;
  industry: string | null;
  employee_count: string | null;
  email: string | null;
  employee_code: string | null;
  department: string | null;
  created_at: string;
  updated_at: string;
};

export type LearnerEducation = {
  id: string;
  user_id: string;
  institution: string;
  degree: string;
  field_of_study: string;
  start_year: string | null;
  end_year: string | null;
  grade: string | null;
  created_at: string;
  updated_at: string;
};

export type LearnerSkill = {
  id: string;
  user_id: string;
  skill_name: string;
  proficiency: string;
  created_at: string;
  updated_at: string;
};

export type TrainingProgramme = {
  id: string;
  title: string;
  description: string;
  status: ProgrammeStatus;
  duration_hours: number | null;
  category: string | null;
  price_cents: number;
  delivery_mode: string;
  training_matter: string | null;
  presentation_notes: string | null;
  question_paper_notes: string | null;
  answer_sheet_notes: string | null;
  created_by: string | null;
  submitted_by_org_id: string | null;
  submitted_by_user_id: string | null;
  submission_notes: string;
  created_at: string;
  updated_at: string;
};

export type ProgrammeTrainingAssetCategory =
  | "matter_files"
  | "presentation"
  | "question_paper"
  | "answer_sheet";

export type ProgrammeTrainingAssetSourceType =
  | "file"
  | "website"
  | "youtube"
  | "text";

export type ProgrammeTrainingAsset = {
  id: string;
  programme_id: string;
  category: ProgrammeTrainingAssetCategory;
  source_type: ProgrammeTrainingAssetSourceType;
  file_name: string;
  file_url: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  content_json?: unknown | null;
  created_at: string;
};

export type TraineeEvaluationStatus =
  | "pending_send"
  | "link_sent"
  | "in_progress"
  | "submitted"
  | "evaluated";

export type TraineeEvaluationQuestion = {
  id: string;
  text: string;
  marks: number;
  type: "mcq" | "text";
  options?: string[];
  correctOptionIndex?: number;
};

export type TraineeEvaluationAnswer = {
  questionId: string;
  selectedOption?: number;
  textAnswer?: string;
};

export type TraineeQuestionEvaluation = {
  questionId: string;
  awardedMarks: number;
  feedback?: string;
  isCorrect?: boolean | null;
};

export type TraineeEvaluation = {
  id: string;
  training_request_id: string;
  session_id: string | null;
  programme_id: string | null;
  user_id: string;
  status: TraineeEvaluationStatus;
  questions: TraineeEvaluationQuestion[];
  answers: TraineeEvaluationAnswer[] | null;
  question_evaluations: TraineeQuestionEvaluation[] | null;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
  evaluator_notes: string | null;
  evaluated_by: string | null;
  evaluated_at: string | null;
  link_sent_at: string | null;
  submitted_at: string | null;
  effectiveness_rating: "effective" | "partial" | "not_effective" | null;
  effectiveness_notes: string | null;
  effectiveness_rated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TrainingSession = {
  id: string;
  programme_id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  status: SessionStatus;
  org_id: string | null;
  trainer_id: string | null;
  capacity: number | null;
  mode: string;
  notes: string | null;
  meeting_platform: string | null;
  meeting_link: string | null;
  meeting_password: string | null;
  meeting_started_at: string | null;
  meeting_ended_at: string | null;
  recording_url: string | null;
  meeting_ai_summary: string | null;
  created_at: string;
  updated_at: string;
};

export type Enrollment = {
  id: string;
  session_id: string;
  user_id: string;
  status: EnrollmentStatus;
  created_at: string;
};

export type Assessment = {
  id: string;
  session_id: string;
  title: string;
  passing_score: number;
  created_at: string;
};

export type AssessmentAttempt = {
  id: string;
  assessment_id: string;
  user_id: string;
  score: number | null;
  passed: boolean | null;
  submitted_at: string;
};

export type Certificate = {
  id: string;
  user_id: string;
  programme_id: string | null;
  session_id: string | null;
  title: string;
  issued_at: string;
  storage_path: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  org_id: string | null;
  invoice_number: string;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  notes: string | null;
  training_request_id: string | null;
  user_id: string | null;
  created_at: string;
};

export type TrainingParticipantPaymentStatus =
  | "pending"
  | "link_sent"
  | "paid"
  | "waived";

export type TrainingParticipantPayment = {
  id: string;
  training_request_id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  payment_status: TrainingParticipantPaymentStatus;
  payment_link: string | null;
  payment_link_sent_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgInvite = {
  id: string;
  org_id: string;
  email: string;
  token: string;
  invited_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
  employee_code: string | null;
  designation: string | null;
  department: string | null;
  full_name: string | null;
  mobile: string | null;
};

export type ProgrammeAssignment = {
  id: string;
  programme_id: string;
  org_id: string | null;
  user_id: string | null;
  assigned_by: string | null;
  status: string;
  notes: string | null;
  assigned_at: string;
};

export type TrainingRequest = {
  id: string;
  org_id: string | null;
  programme_id: string | null;
  /** Human-readable Training ID (e.g. TRN-20260713-A1B2C3) */
  training_code: string;
  title: string;
  message: string;
  preferred_date: string | null;
  status: string;
  requested_by: string | null;
  employee_ids: string[];
  trainer_id: string | null;
  training_date: string | null;
  session_id: string | null;
  invitation_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanySettings = {
  org_id: string;
  ai_enabled: boolean;
  ai_provider: string | null;
  ai_model: string | null;
  ai_api_key: string | null;
  ai_system_prompt: string | null;
  letterhead_company_name: string | null;
  letterhead_tagline: string | null;
  letterhead_header: string | null;
  letterhead_footer: string | null;
  letterhead_logo_url: string | null;
  letterhead_show_gst: boolean;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  bank_upi_id: string | null;
  theme_primary_color: string | null;
  theme_accent_color: string | null;
  theme_mode: string;
  theme_sidebar_style: string | null;
  meeting_prefer_free_external: boolean;
  meeting_default_platform: string;
  meeting_mute_on_entry: boolean;
  meeting_waiting_room: boolean;
  meeting_allow_screen_share: boolean;
  meeting_allow_chat: boolean;
  meeting_recording_enabled: boolean;
  meeting_ai_summary_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyAiProvider = {
  id: string;
  org_id: string;
  display_name: string;
  provider: string;
  model_name: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyAiSkill = {
  id: string;
  org_id: string;
  skill_name: string;
  skill_key: string;
  description: string;
  skill_prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Partial<Organization> & { name: string };
        Update: Partial<Organization>;
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
      };
      org_invites: {
        Row: OrgInvite;
        Insert: Partial<OrgInvite> & { org_id: string; email: string };
        Update: Partial<OrgInvite>;
      };
      org_accreditations: {
        Row: OrgAccreditation;
        Insert: Partial<OrgAccreditation> & {
          org_id: string;
          accreditation_name: string;
        };
        Update: Partial<OrgAccreditation>;
      };
      training_programmes: {
        Row: TrainingProgramme;
        Insert: Partial<TrainingProgramme> & { title: string };
        Update: Partial<TrainingProgramme>;
      };
      programme_training_assets: {
        Row: ProgrammeTrainingAsset;
        Insert: Partial<ProgrammeTrainingAsset> & {
          programme_id: string;
          category: ProgrammeTrainingAssetCategory;
          file_name: string;
          file_url: string;
          storage_path: string;
        };
        Update: Partial<ProgrammeTrainingAsset>;
      };
      training_sessions: {
        Row: TrainingSession;
        Insert: Partial<TrainingSession> & {
          programme_id: string;
          title: string;
        };
        Update: Partial<TrainingSession>;
      };
      enrollments: {
        Row: Enrollment;
        Insert: Partial<Enrollment> & { session_id: string; user_id: string };
        Update: Partial<Enrollment>;
      };
      trainee_evaluations: {
        Row: TraineeEvaluation;
        Insert: Partial<TraineeEvaluation> & {
          training_request_id: string;
          user_id: string;
        };
        Update: Partial<TraineeEvaluation>;
      };
      assessments: {
        Row: Assessment;
        Insert: Partial<Assessment> & { session_id: string; title: string };
        Update: Partial<Assessment>;
      };
      assessment_attempts: {
        Row: AssessmentAttempt;
        Insert: Partial<AssessmentAttempt> & {
          assessment_id: string;
          user_id: string;
        };
        Update: Partial<AssessmentAttempt>;
      };
      certificates: {
        Row: Certificate;
        Insert: Partial<Certificate> & { user_id: string; title: string };
        Update: Partial<Certificate>;
      };
      invoices: {
        Row: Invoice;
        Insert: Partial<Invoice> & { invoice_number: string };
        Update: Partial<Invoice>;
      };
      training_participant_payments: {
        Row: TrainingParticipantPayment;
        Insert: Partial<TrainingParticipantPayment> & {
          training_request_id: string;
          user_id: string;
        };
        Update: Partial<TrainingParticipantPayment>;
      };
      programme_assignments: {
        Row: ProgrammeAssignment;
        Insert: Partial<ProgrammeAssignment> & { programme_id: string };
        Update: Partial<ProgrammeAssignment>;
      };
      training_requests: {
        Row: TrainingRequest;
        Insert: Partial<TrainingRequest> & { org_id: string; title: string };
        Update: Partial<TrainingRequest>;
      };
      company_settings: {
        Row: CompanySettings;
        Insert: Partial<CompanySettings> & { org_id: string };
        Update: Partial<CompanySettings>;
      };
      company_ai_providers: {
        Row: CompanyAiProvider;
        Insert: Partial<CompanyAiProvider> & {
          org_id: string;
          display_name: string;
          provider: string;
          model_name: string;
          api_key: string;
        };
        Update: Partial<CompanyAiProvider>;
      };
      company_ai_skills: {
        Row: CompanyAiSkill;
        Insert: Partial<CompanyAiSkill> & {
          org_id: string;
          skill_name: string;
          skill_key: string;
          skill_prompt: string;
        };
        Update: Partial<CompanyAiSkill>;
      };
      learner_educations: {
        Row: LearnerEducation;
        Insert: Partial<LearnerEducation> & {
          user_id: string;
          institution: string;
          degree: string;
        };
        Update: Partial<LearnerEducation>;
      };
      learner_skills: {
        Row: LearnerSkill;
        Insert: Partial<LearnerSkill> & {
          user_id: string;
          skill_name: string;
        };
        Update: Partial<LearnerSkill>;
      };
    };
  };
};
