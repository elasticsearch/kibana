import type { MaintenanceWindowClientContext } from '../../../../common';
import type { MaintenanceWindow } from '../../types';
import type { GetMaintenanceWindowParams } from './types';
export declare function getMaintenanceWindow(context: MaintenanceWindowClientContext, params: GetMaintenanceWindowParams): Promise<MaintenanceWindow>;
