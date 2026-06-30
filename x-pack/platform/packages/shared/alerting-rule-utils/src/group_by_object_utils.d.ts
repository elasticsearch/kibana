import type { Group } from './types';
export declare const unflattenGrouping: (grouping?: Record<string, string> | undefined) => Record<string, any> | undefined;
export declare const getFormattedGroups: (grouping?: Record<string, unknown>) => Group[] | undefined;
/**
 * Flattens a bucket key returned by Elasticsearch aggregations into an object whose
 * keys correspond to the rule's `groupBy` fields and whose values come from the
 * aggregation `bucketKey`.
 *
 * The contract is:
 *  - `groupBy`            → the same field(s) that were sent in the alert rule params.
 *  - `bucketKey`          → an object whose **first property** relates to the first
 *                           `groupBy` field, the **second property** to the second
 *                           `groupBy`, and so on. The property names coming from
 *                           Elasticsearch (e.g. `key0`, `key1`, …) are irrelevant –
 *                           only their insertion order matters.
 *
 * Example 1 – single group-by:
 *   groupBy   = 'host.hostname'
 *   bucketKey = { key0: 'web-01' }
 *   returns   = { 'host.hostname': 'web-01' }
 *
 * Example 2 – multiple group-bys:
 *   groupBy   = ['host.hostname', 'host.architecture']
 *   bucketKey = { key0: 'web-01', key1: 'amd64' }
 *   returns   = {
 *     'host.hostname':      'web-01',
 *     'host.architecture':  'amd64',
 *   }
 *
 * NOTE: `bucketKey` **must** contain at least the same number of values as there
 * are `groupBy` entries; extra properties will be ignored and missing properties
 * will result in `undefined` values in the flattened object.
 */
export declare const getFlattenGrouping: ({ groupBy, bucketKey, }: {
    groupBy: string | string[] | undefined;
    bucketKey: Record<string, string>;
}) => {
    [k: string]: string;
} | undefined;
