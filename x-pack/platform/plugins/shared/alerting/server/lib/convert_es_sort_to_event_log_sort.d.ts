import type { Sort } from '@elastic/elasticsearch/lib/api/types';
/**
 * This helper function converts esSort:
 *
 * {
 *    field: {
 *      order: 'asc'
 *    }
 * }
 *
 * Into event logger sort:
 *
 * [{
 *    sort_field: field,
 *    sort_order: 'asc',
 * }]
 */
export declare const convertEsSortToEventLogSort: (esSort: Sort) => {
    sort_field: string;
    sort_order: import("@elastic/elasticsearch/lib/api/types").SortOrder;
}[] | undefined;
