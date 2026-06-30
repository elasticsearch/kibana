/**
 * Shape of a `.workflows-events` document returned by trigger-event log search.
 * Mirrors the execution engine trigger-event document shape.
 */
export interface WorkflowsEventsLogDocumentSource {
    '@timestamp': string;
    eventId: string;
    triggerId: string;
    spaceId: string;
    subscriptions: string[];
    sourceExecutionId?: string;
    payload: Record<string, unknown>;
}
/**
 * `_source` from a trigger-event log hit used to build a manual replay payload.
 * Fields other than `payload` are ignored today but documented for callers.
 */
export type TriggerEventReplaySource = Partial<WorkflowsEventsLogDocumentSource>;
/**
 * Platform fields injected when replaying a logged trigger event from the Event tab.
 * Custom trigger payload properties are merged at the same level (see {@link EventTriggerReplayEvent}).
 */
export interface EventTriggerReplayPlatformFields {
    /** ISO-8601 time for this test run (not the logged `@timestamp`). */
    timestamp: string;
    /** Active Kibana space for the replay run. */
    spaceId: string;
    /** Reset for manual replay so chain depth does not carry over from production dispatch. */
    eventChainDepth: 0;
    /** Reset for manual replay so cycle detection starts fresh. */
    eventChainVisitedWorkflowIds: string[];
}
/**
 * `event` object passed to a manual / test workflow run for an event-driven trigger.
 * Trigger-specific payload fields from the log entry are spread alongside platform fields.
 */
export type EventTriggerReplayEvent = EventTriggerReplayPlatformFields & Record<string, unknown>;
/**
 * Top-level workflow run `inputs` JSON built when selecting a row in the Event trigger picker.
 */
export interface EventTriggerReplayInput {
    event: EventTriggerReplayEvent;
}
