export interface ReportingError {
    /**
     * Return a message describing the error that is human friendly
     */
    humanFriendlyMessage?(): string;
}
export declare abstract class ReportingError extends Error {
    details?: string | undefined;
    /**
     * A string that uniquely brands an error type. This is used to power telemetry
     * about reporting failures.
     *
     * @note Convention for codes: lower-case, snake-case and end in `_error`.
     */
    abstract get code(): string;
    constructor(details?: string | undefined);
    get message(): string;
    toString(): string;
}
/**
 * While validating the page layout parameters for a screenshot type report job
 */
export declare class InvalidLayoutParametersError extends ReportingError {
    static code: "invalid_layout_parameters_error";
    get code(): "invalid_layout_parameters_error";
}
/**
 * While loading requests in the Kibana app, a URL was encountered that the network policy did not allow.
 */
export declare class DisallowedOutgoingUrl extends ReportingError {
    static code: "disallowed_outgoing_url_error";
    get code(): "disallowed_outgoing_url_error";
}
/**
 * While performing some reporting action, like fetching data from ES, our
 * access token expired.
 */
export declare class AuthenticationExpiredError extends ReportingError {
    static code: "authentication_expired_error";
    get code(): string;
}
export declare class MissingAuthenticationError extends ReportingError {
    static code: "missing_authentication_header_error";
    get code(): string;
}
export declare class QueueTimeoutError extends ReportingError {
    static code: "queue_timeout_error";
    get code(): string;
}
/**
 * An unknown error has occurred. See details.
 */
export declare class UnknownError extends ReportingError {
    static code: "unknown_error";
    get code(): string;
}
export declare class PdfWorkerOutOfMemoryError extends ReportingError {
    static code: "pdf_worker_out_of_memory_error";
    get code(): string;
    humanFriendlyMessage(): string;
}
export declare class BrowserCouldNotLaunchError extends ReportingError {
    static code: "browser_could_not_launch_error";
    get code(): string;
    humanFriendlyMessage(): string;
}
export declare class BrowserUnexpectedlyClosedError extends ReportingError {
    static code: "browser_unexpectedly_closed_error";
    get code(): string;
}
export declare class BrowserScreenshotError extends ReportingError {
    static code: "browser_screenshot_error";
    get code(): string;
}
export declare class KibanaShuttingDownError extends ReportingError {
    static code: "kibana_shutting_down_error";
    get code(): string;
}
/**
 * Special error case that should only occur on Cloud when trying to generate
 * a report on a Kibana instance that is too small to be running Chromium.
 */
export declare class VisualReportingSoftDisabledError extends ReportingError {
    static code: "visual_reporting_soft_disabled_error";
    get code(): string;
    humanFriendlyMessage(): string;
}
export declare class ReportingSavedObjectNotFoundError extends ReportingError {
    static code: "reporting_saved_object_not_found_error";
    get code(): string;
}
