import type { ISavedObjectsRepository, SavedObjectsServiceStart } from '@kbn/core/server';
import type { AlertsHealth } from '@kbn/alerting-types';
export declare const getHealth: (internalSavedObjectsRepository: ISavedObjectsRepository) => Promise<AlertsHealth>;
export declare const getAlertingHealthStatus: (savedObjects: SavedObjectsServiceStart, stateRuns: number) => Promise<{
    state: Readonly<{} & {
        runs: number;
        health_status: string;
    }>;
}>;
