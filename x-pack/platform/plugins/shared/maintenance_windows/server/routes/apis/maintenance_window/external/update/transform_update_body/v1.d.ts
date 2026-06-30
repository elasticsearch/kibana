import type { UpdateMaintenanceWindowRequestBodyV1 } from '../../../../../schemas/maintenance_window/external/request/update';
import type { UpdateMaintenanceWindowParams } from '../../../../../../application/methods/update/types';
/**
 *  This function converts from the external, human readable, Maintenance Window creation/POST
 *  type expected by the public APIs, to the internal type used by the client.
 */
export declare const transformUpdateBody: (updateBody: UpdateMaintenanceWindowRequestBodyV1) => UpdateMaintenanceWindowParams["data"];
