import type { AlertStatusValues } from '@kbn/alerting-plugin/common';
export interface AlertListItem {
    alert: string;
    status: AlertStatusValues;
    start?: Date;
    duration: number;
    isMuted: boolean;
    sortPriority: number;
    flapping: boolean;
    maintenanceWindowIds?: string[];
    tracked: boolean;
}
export interface RefreshToken {
    resolve: () => void;
    reject: () => void;
}
