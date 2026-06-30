import type { DateMath, MappingRuntimeFields } from '@elastic/elasticsearch/lib/api/types';
import type { AnonymizationFieldResponse } from '../../schemas/anonymization_fields/bulk_crud_anonymization_fields_route.gen';
export declare const DEFAULT_END = "now";
export declare const DEFAULT_START = "now-24h";
interface GetOpenAndAcknowledgedAlertsQuery {
    allow_no_indices: boolean;
    fields: Array<{
        field: string;
        include_unmapped: boolean;
    }>;
    query: {
        bool: {
            filter: Array<Record<string, unknown>>;
        };
    };
    runtime_mappings: MappingRuntimeFields;
    size: number;
    sort: Array<{
        [key: string]: {
            order: 'desc' | 'asc';
        };
    }>;
    _source: boolean;
    ignore_unavailable: boolean;
    index: string[];
}
/**
 * This query returns open and acknowledged (non-building block) alerts in the last 24 hours.
 *
 * The alerts are ordered by risk score, and then from the most recent to the oldest.
 */
export declare const getOpenAndAcknowledgedAlertsQuery: ({ alertsIndexPattern, anonymizationFields, end, filter, size, start, }: {
    alertsIndexPattern: string;
    anonymizationFields: AnonymizationFieldResponse[];
    end?: DateMath | null;
    filter?: Record<string, unknown> | null;
    size: number;
    start?: DateMath | null;
}) => GetOpenAndAcknowledgedAlertsQuery;
export {};
