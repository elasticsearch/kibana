import type { MaintenanceWindowClientContext } from '../../../../common';
import type { MaintenanceWindow } from '../../types';
import type { CreateMaintenanceWindowParams } from './types';
export declare function createMaintenanceWindow(context: MaintenanceWindowClientContext, params: CreateMaintenanceWindowParams): Promise<MaintenanceWindow>;
