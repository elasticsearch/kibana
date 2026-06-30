import type { ElasticsearchClient, Logger } from '@kbn/core/server';
export interface StripStaleUiamApiKeysResult {
    /** Rule docs the script actually rewrote (i.e. ones that were stripped). */
    updated: number;
    /**
     * Rule docs that were concurrently modified mid-pass. They were not touched and need a
     * retry run. `conflicts: 'proceed'` keeps the rest of the pass going.
     */
    versionConflicts: number;
    /** Rule docs the script declared as no-ops (no work to do). */
    noops: number;
    /** Total rule docs (of type `alert`) the query visited. */
    total: number;
}
/**
 * Strips the stale `uiamApiKey` attribute from every rule (`alert`) saved object in the
 * `.kibana_alerting_cases` index that matches the bug pattern from PR #263887.
 *
 * Implemented with `update_by_query` rather than the Saved Objects client because:
 *   1. Removing an attribute is not expressible via a partial SO update.
 *   2. The SOR/ESO write path would force a full decrypt + re-encrypt of `apiKey` and
 *      strict AAD reconstruction on every rule — a much bigger blast radius than a single
 *      painless `remove('uiamApiKey')`.
 *   3. There is documented prior art for exactly this approach in the task-manager plugin
 *      (`stripUiamKeysFromProvisionedTasks`), which already handles the same bug class for
 *      task docs.
 *
 * Returns the counts the caller needs to decide whether to latch the task (`versionConflicts
 * === 0` means every alert doc was successfully visited and processed in this pass).
 */
export declare const stripStaleUiamApiKeysFromRules: (esClient: ElasticsearchClient, logger: Logger) => Promise<StripStaleUiamApiKeysResult>;
