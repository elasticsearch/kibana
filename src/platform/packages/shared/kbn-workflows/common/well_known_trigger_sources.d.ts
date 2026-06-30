/**
 * Values persisted on workflow execution `triggeredBy` for built-in trigger paths.
 * 'workflow-step' is used for sub-workflows.
 * Any other string is treated as an event-driven trigger id (e.g. `cases.caseCreated`).
 */
export type WellKnownWorkflowTriggerSource = 'manual' | 'scheduled' | 'alert' | 'workflow-step';
/**
 * Returns true when `triggeredBy` is one of the platform-defined execution sources.
 * Used to distinguish built-in triggers from event-driven trigger ids in telemetry and APM.
 */
export declare const isWellKnownWorkflowTriggerSource: (triggeredBy: string | undefined) => triggeredBy is WellKnownWorkflowTriggerSource;
/**
 * Returns true when `triggeredBy` is a custom event trigger id (non-empty and not well-known).
 * This helper is the single source of truth for event-driven trigger-id classification.
 */
export declare const isEventDrivenWorkflowTriggerSource: (triggeredBy: string | undefined) => triggeredBy is string;
