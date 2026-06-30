import type { CoreAuthenticationService, ElasticsearchClient, KibanaRequest } from '@kbn/core/server';
import type { SavedObjectReference } from '@kbn/core/server';
import type { RuleTypeSolution } from '@kbn/alerting-types';
import type { ObjectChange, GetHistoryResult, LogChangeHistoryOptions, GetChangeHistoryOptions } from '@kbn/change-history';
import type { RawRule } from '../../../types';
export interface RuleSnapshot {
    attributes: RawRule;
    references: SavedObjectReference[];
}
export interface RuleChange extends Omit<ObjectChange, 'snapshot'> {
    module: RuleTypeSolution;
    /** Post-change rule state; persisted as `object.snapshot` by @kbn/change-history. */
    snapshot: RuleSnapshot;
}
export interface ChangeTrackingServiceInitializeParams {
    elasticsearchClient: ElasticsearchClient;
    authService: CoreAuthenticationService;
}
export interface IChangeTrackingService {
    asScoped(request: KibanaRequest): IScopedChangeTrackingService;
}
export interface IScopedChangeTrackingService {
    log(change: RuleChange, opts: ScopedLogChangeHistoryOptions): Promise<void>;
    logBulk(changes: RuleChange[], opts: ScopedLogChangeHistoryOptions): Promise<void>;
    getHistory(module: RuleTypeSolution, spaceId: string, ruleId: string, opts: GetChangeHistoryOptions): Promise<GetHistoryResult>;
}
/**
 * Per-call options for a request-scoped change tracking client. The wrapper
 * resolves `username`, `userProfileId` from the bound request,
 * so callers must not provide them.
 */
export type ScopedLogChangeHistoryOptions = Omit<LogChangeHistoryOptions, 'username' | 'userProfileId'>;
