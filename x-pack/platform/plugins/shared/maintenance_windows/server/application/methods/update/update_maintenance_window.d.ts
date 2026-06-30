import type { MaintenanceWindowClientContext } from '../../../../common';
import type { MaintenanceWindow } from '../../types';
import type { UpdateMaintenanceWindowParams } from './types';
export declare function updateMaintenanceWindow(context: MaintenanceWindowClientContext, params: UpdateMaintenanceWindowParams): Promise<MaintenanceWindow>;
