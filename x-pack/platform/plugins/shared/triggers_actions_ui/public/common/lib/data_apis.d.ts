import type { HttpSetup } from '@kbn/core/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import type { FieldOption } from '../types';
export declare function getMatchingIndices({ pattern, http, projectRouting, }: {
    pattern: string;
    http: HttpSetup;
    projectRouting?: string;
}): Promise<Record<string, any>>;
export declare function getESIndexFields({ indexes, http, }: {
    indexes: string[];
    http: HttpSetup;
}): Promise<FieldOption[]>;
type DataViewsService = Pick<DataViewsContract, 'find'>;
export declare const setDataViewsService: (aDataViewsService: DataViewsService) => void;
export declare const getDataViewsService: () => DataViewsService;
export declare const loadIndexPatterns: (pattern: string) => Promise<string[]>;
export {};
