import type { KueryNode } from '@kbn/es-query';
export declare const getFieldNameAttribute: (fieldName: string, attributesToIgnore: string[]) => string;
export interface IterateActionProps {
    ast: KueryNode;
    index: number;
    fieldName: string;
    localFieldName: string;
}
export interface IterateFilterKureyNodeParams {
    astFilter: KueryNode;
    hasNestedKey?: boolean;
    nestedKeys?: string;
    storeValue?: boolean;
    path?: string;
    action?: (props: IterateActionProps) => void;
}
export interface ValidateFilterKueryNodeParams extends IterateFilterKureyNodeParams {
    excludedFieldNames: string[];
}
export declare const iterateFilterKureyNode: ({ astFilter, hasNestedKey, nestedKeys, storeValue, path, action, }: IterateFilterKureyNodeParams) => void;
