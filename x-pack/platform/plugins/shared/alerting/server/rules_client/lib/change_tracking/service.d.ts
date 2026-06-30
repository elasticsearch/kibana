import type { KibanaRequest } from '@kbn/core/server';
import type { RuleTypeSolution } from '@kbn/alerting-types';
import type { Logger } from '@kbn/logging';
import type { ChangeTrackingServiceInitializeParams, IChangeTrackingService, IScopedChangeTrackingService } from './types';
export declare class ChangeTrackingService implements IChangeTrackingService {
    private clients;
    private logger;
    private kibanaVersion;
    private modules;
    private dataset;
    private authService?;
    constructor(logger: Logger, kibanaVersion: string);
    register(module: RuleTypeSolution): void;
    isInitialized(module: RuleTypeSolution): boolean;
    initialize({ elasticsearchClient, authService }: ChangeTrackingServiceInitializeParams): void;
    asScoped(request: KibanaRequest): IScopedChangeTrackingService;
    private initializeAll;
    private log;
    private logBulk;
    private getHistory;
}
