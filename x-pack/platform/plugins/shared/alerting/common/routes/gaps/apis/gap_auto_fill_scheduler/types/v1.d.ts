import type { TypeOf } from '@kbn/config-schema';
import type { gapAutoFillSchedulerBodySchemaV1, gapAutoFillSchedulerResponseSchemaV1, gapAutoFillSchedulerUpdateBodySchemaV1, getGapAutoFillSchedulerParamsSchemaV1, gapAutoFillSchedulerLogEntrySchemaV1, gapAutoFillSchedulerLogsResponseSchemaV1, gapAutoFillSchedulerLogsRequestQuerySchemaV1 } from '..';
export type GapAutoFillSchedulerRequestBody = TypeOf<typeof gapAutoFillSchedulerBodySchemaV1>;
export type UpdateGapAutoFillSchedulerRequestBody = TypeOf<typeof gapAutoFillSchedulerUpdateBodySchemaV1>;
export type GapAutoFillSchedulerResponseBody = TypeOf<typeof gapAutoFillSchedulerResponseSchemaV1>;
export type GetGapAutoFillSchedulerParams = TypeOf<typeof getGapAutoFillSchedulerParamsSchemaV1>;
export interface GapAutoFillSchedulerResponse {
    body: GapAutoFillSchedulerResponseBody;
}
export interface UpdateGapAutoFillSchedulerResponse {
    body: GapAutoFillSchedulerResponseBody;
}
export type GapAutoFillSchedulerLogEntry = TypeOf<typeof gapAutoFillSchedulerLogEntrySchemaV1>;
export type GapAutoFillSchedulerLogsResponseBody = TypeOf<typeof gapAutoFillSchedulerLogsResponseSchemaV1>;
export interface GapAutoFillSchedulerLogsResponse {
    body: GapAutoFillSchedulerLogsResponseBody;
}
export type GapAutoFillSchedulerLogsRequestQuery = TypeOf<typeof gapAutoFillSchedulerLogsRequestQuerySchemaV1>;
