import type { TypeOf } from '@kbn/config-schema';
import type { snoozeBodyInternalSchemaV1 } from '../../../../../../../../common/routes/rule/apis/snooze';
type SnoozeBodyInternalSchema = TypeOf<typeof snoozeBodyInternalSchemaV1>;
export declare const transformSnoozeBody: (opts: SnoozeBodyInternalSchema) => {
    snoozeSchedule: SnoozeBodyInternalSchema['snooze_schedule'];
};
export {};
