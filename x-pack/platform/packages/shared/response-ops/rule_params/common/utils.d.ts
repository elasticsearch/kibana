import { Comparator } from './constants';
export type ComparatorFn = (value: number, threshold: number[]) => boolean;
export declare const betweenComparators: Set<string>;
export declare const jobsSelectionSchema: import("@kbn/config-schema").ObjectType<{
    jobIds: import("@kbn/config-schema").Type<string[]>;
    groupIds: import("@kbn/config-schema").Type<string[]>;
}>;
export declare const oneOfLiterals: (arrayOfLiterals: Readonly<string[]>) => import("@kbn/config-schema").Type<string>;
export declare const validateIsStringElasticsearchJSONFilter: (value: string) => "filterQuery must be a valid Elasticsearch filter expressed in JSON" | undefined;
export declare const validateKQLStringFilter: (value: string) => string | undefined;
export type TimeUnitChar = 's' | 'm' | 'h' | 'd';
export declare enum LEGACY_COMPARATORS {
    OUTSIDE_RANGE = "outside"
}
export declare function validateTimeWindowUnits(timeWindowUnit: string): string | undefined;
export declare function validateAggType(aggType: string): string | undefined;
export declare function validateGroupBy(groupBy: string): string | undefined;
export declare const ComparatorFns: Map<Comparator, ComparatorFn>;
export declare const getComparatorSchemaType: (validate: (comparator: Comparator) => string | void) => import("@kbn/config-schema").Type<Comparator>;
export declare const ComparatorFnNames: Set<Comparator>;
export declare function validateKuery(query: string): string | undefined;
export declare function validateComparator(comparator: Comparator): string | undefined;
