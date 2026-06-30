import type { MaintenanceWindowAttributes } from '../../data/types/maintenance_window_attributes';
import type { MaintenanceWindow } from '../types';
export interface TransformMaintenanceWindowAttributesMaintenanceWindowParams {
    attributes: MaintenanceWindowAttributes;
    id: string;
}
export declare const transformMaintenanceWindowAttributesToMaintenanceWindow: (params: TransformMaintenanceWindowAttributesMaintenanceWindowParams) => MaintenanceWindow;
