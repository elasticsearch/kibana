import type { MaintenanceWindowResponseV1 } from '../../../../../schemas/maintenance_window/internal/response';
import type { MaintenanceWindow } from '../../../../../../application/types';
export declare const transformInternalMaintenanceWindowToExternal: (maintenanceWindow: MaintenanceWindow) => MaintenanceWindowResponseV1;
