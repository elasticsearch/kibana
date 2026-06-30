import type { MonitoringCollectionSetup } from '@kbn/monitoring-collection-plugin/server';
import type { CoreSetup } from '@kbn/core/server';
import type { AlertingPluginsStart } from '../plugin';
export declare function registerClusterCollector({ monitoringCollection, core, }: {
    monitoringCollection: MonitoringCollectionSetup;
    core: CoreSetup<AlertingPluginsStart, unknown>;
}): void;
