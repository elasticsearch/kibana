import type { CreateMaintenanceWindowRequestBodyV1 } from '../../../../../schemas/maintenance_window/external/request/create';
import type { CreateMaintenanceWindowParams } from '../../../../../../application/methods/create/types';
/**
 *  This function converts from the external, human readable, Maintenance Window creation/POST
 *  type expected by the public APIs, to the internal type used by the client.
 */
export declare const transformCreateBody: (createBody: CreateMaintenanceWindowRequestBodyV1) => CreateMaintenanceWindowParams["data"];
