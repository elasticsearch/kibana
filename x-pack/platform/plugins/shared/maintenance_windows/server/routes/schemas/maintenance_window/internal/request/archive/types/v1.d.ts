import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { archiveBodySchemaV1, archiveParamsSchemaV1 } from '..';
export type ArchiveMaintenanceWindowRequestBody = TypeOf<typeof archiveBodySchemaV1>;
export type ArchiveMaintenanceWindowRequestParams = TypeOf<typeof archiveParamsSchemaV1>;
export interface ArchiveMaintenanceWindowResponse {
    body: MaintenanceWindowResponseV1;
}
