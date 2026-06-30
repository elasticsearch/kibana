/**
 * Optional metadata passed when scheduling or executing a workflow from the
 * event-driven trigger path. Persisted on the execution document (see execution
 * engine `createAndPersistWorkflowExecution`) for latency and analytics.
 */
export interface WorkflowExecutionEventDispatchMetadata {
    /** ISO-8601 string or epoch ms when the emitting service handled the trigger event */
    eventDispatchTimestamp?: string | number;
    /** Registered trigger id for the emission (e.g. cases.caseCreated) */
    eventTriggerId?: string;
    /** UUID of the emission */
    eventId?: string;
}
