import type { EventTypeOpts } from '@kbn/core/server';
export interface UiamProvisioningRunEventData {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    has_more_to_provision: boolean;
    has_error: boolean;
    run_number: number;
}
export declare const UIAM_PROVISIONING_RUN_EVENT: EventTypeOpts<UiamProvisioningRunEventData>;
export declare const uiamProvisioningEvents: Array<EventTypeOpts<Record<string, unknown>>>;
