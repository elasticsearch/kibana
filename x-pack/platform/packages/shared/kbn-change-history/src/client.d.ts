import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { GetHistoryResult, LogChangeHistoryOptions, GetChangeHistoryOptions, ObjectChange } from './types';
export { DATA_STREAM_NAME } from './constants';
export interface IChangeHistoryClient {
    isInitialized(): boolean;
    initialize(elasticsearchClient: ElasticsearchClient): Promise<void>;
    log(change: ObjectChange, opts: LogChangeHistoryOptions): Promise<void>;
    logBulk(changes: ObjectChange[], opts: LogChangeHistoryOptions): Promise<void>;
    getHistory(spaceId: string, objectType: string, objectId: string, opts?: GetChangeHistoryOptions): Promise<GetHistoryResult>;
}
export declare class ChangeHistoryClient implements IChangeHistoryClient {
    private module;
    private dataset;
    private kibanaVersion;
    private logger;
    private client?;
    constructor({ module, dataset, logger, kibanaVersion, }: {
        module: string;
        dataset: string;
        logger: Logger;
        kibanaVersion: string;
    });
    /**
     * Check if the change tracking service is initialized.
     * @returns true if the change tracking service is initialized.
     */
    isInitialized(): boolean;
    /**
     * Initialize the change tracking service.
     * @param elasticsearchClient The privileged elasticsearch client `core.elasticsearch.client.asInternalUser`.
     * @returns A promise that resolves when the change tracking service is initialized.
     * @throws An error if the data stream is not initialized properly.
     */
    initialize(elasticsearchClient: ElasticsearchClient): Promise<void>;
    /**
     * Log a change for a single object.
     * @param change - The affected object; `change.snapshot` must be the **after** (post-change) state persisted as `object.snapshot`.
     * @param opts - The options for the change.
     * @returns A promise that resolves when the change is logged.
     * @throws An error if the data stream is not initialized, or if an error occurs while logging the change.
     */
    log(change: ObjectChange, opts: LogChangeHistoryOptions): Promise<void>;
    /**
     * Log a bulk change for one or more objects.
     * @param changes - The affected objects; each `snapshot` is the **after** (post-change) state for that object.
     * @param opts - The options for the bulk change.
     * @param opts.action - The action performed (`rule_create`, `rule_update`, `rule_delete`, etc.)
     * @param opts.username - Current login name for the user who performed the change.
     * @param opts.userProfileId - Optional user profile ID (auth realm). See Elastic User Profiles.
     * @param opts.spaceId - The ID of the space that the change belongs to.
     * @param opts.correlationId - Optional correlation ID for the bulk change.
     * @param opts.data - Optional data to merge into the change history document.
     * @param opts.fieldsToHash - Optional fields whose string values are replaced with full SHA-256 digests in the stored snapshot.
     * @param opts.refresh - Optional indicator to force an ES refresh after changes (affects performance)
     * @returns A promise that resolves when the bulk change is logged.
     * @throws An error if the data stream is not initialized, or if an error occurs while logging the change.
     */
    logBulk(changes: ObjectChange[], opts: LogChangeHistoryOptions): Promise<void>;
    /**
     * Get the change history of an object.
     * @param spaceId - The kibana space Id where this object exists
     * @param objectType - The type of the object.
     * @param objectId - The ID of the object.
     * @param opts - The options for the history query.
     * @param opts.additionalFilters - Additional filters to apply to the history query.
     * @param opts.sort - The sort order for the history query.
     * @param opts.from - The starting index for the history query.
     * @param opts.size - The number of results to return.
     * @returns The history of the object.
     * @throws An error if the data stream is not initialized, or if an error occurs while getting the history.
     */
    getHistory(spaceId: string, objectType: string, objectId: string, opts?: GetChangeHistoryOptions): Promise<GetHistoryResult>;
}
