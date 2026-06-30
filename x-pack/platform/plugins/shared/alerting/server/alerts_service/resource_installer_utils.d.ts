import type { ClusterPutComponentTemplateRequest, MappingDynamicTemplate } from '@elastic/elasticsearch/lib/api/types';
import type { FieldMap } from '@kbn/alerts-as-data-utils';
interface GetComponentTemplateNameOpts {
    context?: string;
    name?: string;
}
export declare const VALID_ALERT_INDEX_PREFIXES: string[];
export declare const getComponentTemplateName: ({ context, name }?: GetComponentTemplateNameOpts) => string;
export interface IIndexPatternString {
    template: string;
    pattern: string;
    reindexedPattern?: string;
    alias: string;
    name: string;
    basePattern: string;
    validPrefixes?: string[];
    secondaryAlias?: string;
}
interface GetIndexTemplateAndPatternOpts {
    context: string;
    secondaryAlias?: string;
    namespace?: string;
}
export declare const getIndexTemplateAndPattern: ({ context, namespace, secondaryAlias, }: GetIndexTemplateAndPatternOpts) => IIndexPatternString;
type GetComponentTemplateOpts = GetComponentTemplateNameOpts & {
    fieldMap: FieldMap;
    dynamic?: 'strict' | false;
    includeSettings?: boolean;
    dynamicTemplates?: Array<Record<string, MappingDynamicTemplate>>;
};
export declare const getComponentTemplate: ({ fieldMap, context, name, dynamic, includeSettings, dynamicTemplates, }: GetComponentTemplateOpts) => ClusterPutComponentTemplateRequest;
export {};
