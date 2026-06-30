import type { HttpSetup } from '@kbn/core/public';
import type { FieldSpec } from '@kbn/data-views-plugin/common';
import type { FieldOption } from '../types';
export interface IOption {
    label: string;
    options: Array<{
        value: string;
        label: string;
        'data-test-subj'?: string;
    }>;
}
export declare const getIndexOptions: (http: HttpSetup, pattern: string, projectRouting?: string) => Promise<IOption[]>;
export declare const convertFieldSpecToFieldOption: (fieldSpec: FieldSpec[], onlyMappedOrRuntime?: boolean) => FieldOption[];
export declare const getFields: (http: HttpSetup, indexes: string[]) => Promise<FieldOption[]>;
export declare const firstFieldOption: {
    text: string;
    value: string;
};
