import type { KueryNode } from '@kbn/es-query';
import type { SuggestionsAbstraction } from '@kbn/kql/public/components/typeahead/suggestions_component';
export interface IterateFieldsKueryNodeParams {
    astFilter: KueryNode;
    suggestionsAbstraction: SuggestionsAbstraction;
    hasNestedKey?: boolean;
    nestedKeys?: string;
    storeValue?: boolean;
    path?: string;
    action?: (args: IterateActionProps) => void;
}
export interface IterateActionProps {
    ast: KueryNode;
    index: number;
    fieldName: string;
}
export declare const validateFieldsKueryNode: ({ astFilter, suggestionsAbstraction, }: {
    astFilter: KueryNode;
    suggestionsAbstraction: SuggestionsAbstraction;
}) => void;
