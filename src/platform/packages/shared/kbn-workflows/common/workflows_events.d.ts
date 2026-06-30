import type { DataViewBase, DataViewFieldBase } from '@kbn/es-query';
export declare const WORKFLOWS_EVENTS_DATA_STREAM = ".workflows-events";
/**
 * Upper bound passed to Elasticsearch `track_total_hits` when searching `.workflows-events`.
 *
 * Totals at or above this value are a lower bound only — the index may contain more matching
 * documents. The trigger-event search API returns `total: WORKFLOWS_EVENTS_TRACK_TOTAL_HITS_CAP`
 * in that case; clients should display `10,000+` (or equivalent) rather than an exact count.
 *
 * Matches UnifiedDataTable's `MAX_LOADED_GRID_ROWS` (10_000) so the Event tab grid and reported
 * total stay aligned.
 */
export declare const WORKFLOWS_EVENTS_TRACK_TOTAL_HITS_CAP = 10000;
/**
 * KQL field metadata for `.workflows-events`, shared by server and client:
 *
 * - **Server** ({@link WORKFLOWS_EVENTS_DATA_VIEW}): passed to `toElasticsearchQuery` in the
 *   execution engine. That path has no access to registered browser data views, so we use a static
 *   `DataViewBase` built from this list.
 * - **Client** (Event trigger picker): creates an ephemeral ad-hoc data view for the KQL bar, then
 *   replaces its fields with this same list so autocomplete and server translation stay aligned.
 *
 * `spaceId` is intentionally omitted — the search API always scopes results to the request space.
 */
export declare const WORKFLOWS_EVENTS_DATA_VIEW_FIELDS: DataViewFieldBase[];
/** Static data view used for server-side KQL → Elasticsearch translation. */
export declare const WORKFLOWS_EVENTS_DATA_VIEW: DataViewBase;
