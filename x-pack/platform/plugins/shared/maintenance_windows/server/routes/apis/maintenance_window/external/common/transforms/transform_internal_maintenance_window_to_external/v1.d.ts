import type { MaintenanceWindow } from '../../../../../../../application/types';
import type { MaintenanceWindowResponseV1 } from '../../../../../../schemas/maintenance_window/external/response';
/**
 *  This function converts from the internal Maintenance Window type used by the application client,
 *  to the external human readable type used by the public APIs.
 */
export declare const transformInternalMaintenanceWindowToExternal: (maintenanceWindow: MaintenanceWindow) => MaintenanceWindowResponseV1;
