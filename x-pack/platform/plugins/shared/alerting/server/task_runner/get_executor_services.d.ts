import type { IUiSettingsClient, KibanaRequest, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { DataViewsContract } from '@kbn/data-views-plugin/common';
import type { CpsData } from '../types';
import type { WrappedScopedClusterClient } from '../lib/wrap_scoped_cluster_client';
import type { WrappedSearchSourceClient } from '../lib/wrap_search_source_client';
import type { RuleMonitoringService } from '../monitoring/rule_monitoring_service';
import type { RuleResultService } from '../monitoring/rule_result_service';
import type { AsyncSearchParams, AsyncSearchStrategies, PublicRuleMonitoringService, PublicRuleResultService } from '../types';
import { type AsyncSearchClient, type TaskRunnerContext } from './types';
interface GetExecutorServicesOpts {
    context: TaskRunnerContext;
    fakeRequest: KibanaRequest;
    abortController: AbortController;
    logger: Logger;
    ruleMonitoringService: RuleMonitoringService;
    ruleResultService: RuleResultService;
    ruleData: {
        name: string;
        alertTypeId: string;
        id: string;
        spaceId: string;
    };
    ruleTaskTimeout?: string;
    uiamApiKey?: string | null;
}
export interface ExecutorServices {
    ruleMonitoringService: PublicRuleMonitoringService;
    ruleResultService: PublicRuleResultService;
    savedObjectsClient: SavedObjectsClientContract;
    uiSettingsClient: IUiSettingsClient;
    wrappedScopedClusterClient: WrappedScopedClusterClient;
    getDataViews: () => Promise<DataViewsContract>;
    getWrappedSearchSourceClient: () => Promise<WrappedSearchSourceClient>;
    getAsyncSearchClient: <T extends AsyncSearchParams>(strategy: AsyncSearchStrategies) => AsyncSearchClient<T>;
    getCpsData: () => Promise<CpsData>;
}
export declare const getExecutorServices: (opts: GetExecutorServicesOpts) => ExecutorServices;
export {};
