/**
 * This is being used by Cases in
 * x-pack/platform/plugins/shared/cases/common/types/domain/case/v1.ts.
 * Introducing a breaking change in this enum will
 * force cases to create a version of the domain object
 * which in turn will force cases to create a new version
 * to most of the Cases APIs.
 */
export declare enum CaseStatuses {
    open = "open",
    'in-progress' = "in-progress",
    closed = "closed"
}
