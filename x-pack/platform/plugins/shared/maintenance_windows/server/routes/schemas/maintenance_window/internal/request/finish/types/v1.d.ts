import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { finishParamsSchemaV1 } from '..';
export type FinishMaintenanceWindowRequestParams = TypeOf<typeof finishParamsSchemaV1>;
export interface FinishMaintenanceWindowResponse {
    body: MaintenanceWindowResponseV1;
}
