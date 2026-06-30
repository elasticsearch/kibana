import type { SavedObjectsClientContract } from '@kbn/core/server';
import { type KueryNode } from '@kbn/es-query';
/**
 * Returns a KQL filter that excludes rules which already have provisioning status
 * COMPLETED/SKIPPED or failed with a permanent UIAM conversion error code (see
 * {@link PERMANENT_UIAM_CONVERSION_ERROR_CODES}). Returns undefined when there
 * are no such rules (no filter applied).
 */
export declare const getExcludeRulesFilter: (savedObjectsClient: SavedObjectsClientContract) => Promise<KueryNode | undefined>;
/**
 * Splits rule IDs into chunks and builds nested `or` nodes so that no single
 * bool.should exceeds Elasticsearch's max_clause_count.
 */
export declare const buildChunkedOrNode: (ruleIds: string[], chunkSize: number) => KueryNode;
