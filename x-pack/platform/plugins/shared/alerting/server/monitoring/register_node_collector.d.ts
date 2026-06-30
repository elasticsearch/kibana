import type { MonitoringCollectionSetup } from '@kbn/monitoring-collection-plugin/server';
import type { InMemoryMetrics } from './in_memory_metrics';
export declare function registerNodeCollector({ monitoringCollection, inMemoryMetrics, }: {
    monitoringCollection: MonitoringCollectionSetup;
    inMemoryMetrics: InMemoryMetrics;
}): void;
