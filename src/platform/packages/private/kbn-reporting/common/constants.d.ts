import type { LicenseType } from '@kbn/licensing-types';
export declare const ALLOWED_JOB_CONTENT_TYPES: string[];
export declare const UI_SETTINGS_SEARCH_INCLUDE_FROZEN = "search:includeFrozen";
export declare const UI_SETTINGS_CUSTOM_PDF_LOGO = "xpackReporting:customPdfLogo";
export declare const UI_SETTINGS_DATEFORMAT_TZ = "dateFormat:tz";
export declare const LICENSE_TYPE_TRIAL: "trial";
export declare const LICENSE_TYPE_BASIC: "basic";
export declare const LICENSE_TYPE_CLOUD_STANDARD: "standard";
export declare const LICENSE_TYPE_GOLD: "gold";
export declare const LICENSE_TYPE_PLATINUM: "platinum";
export declare const LICENSE_TYPE_ENTERPRISE: "enterprise";
export declare const SCHEDULED_REPORT_VALID_LICENSES: LicenseType[];
export declare const REPORTING_FEATURE_ID = "Reporting";
export declare const EXPORT_TYPE_SINGLE: "single";
export declare const EXPORT_TYPE_SCHEDULED: "scheduled";
export declare const REPORTING_EXPORT_TYPES: ("single" | "scheduled")[];
export declare const JOB_COMPLETION_NOTIFICATIONS_SESSION_KEY = "xpack.reporting.jobCompletionNotifications";
export declare const REPORTING_REDIRECT_ALLOWED_LOCATOR_TYPES: string[];
export declare const REPORTING_REDIRECT_APP = "/app/reportingRedirect";
export declare const REPORTING_REDIRECT_LOCATOR_STORE_KEY = "__REPORTING_REDIRECT_LOCATOR_STORE_KEY__";
export declare const REPORTING_MANAGEMENT_HOME = "/app/management/insightsAndAlerting/reporting";
export declare const REPORTING_MANAGEMENT_SCHEDULES = "/app/management/insightsAndAlerting/reporting/schedules";
export declare const ILM_POLICY_NAME = "kibana-reporting";
export declare enum JOB_STATUS {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    WARNINGS = "completed_with_warnings"
}
export declare const REPORT_TABLE_ID = "reportJobListing";
export declare const REPORT_TABLE_ROW_ID = "reportJobRow";
