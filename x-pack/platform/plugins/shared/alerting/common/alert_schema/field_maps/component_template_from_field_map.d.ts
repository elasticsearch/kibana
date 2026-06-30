import type { ClusterPutComponentTemplateRequest, MappingDynamicTemplate } from '@elastic/elasticsearch/lib/api/types';
import { type FieldMap } from '@kbn/alerts-as-data-utils';
export interface GetComponentTemplateFromFieldMapOpts {
    name: string;
    fieldMap: FieldMap;
    includeSettings?: boolean;
    dynamic?: 'strict' | false;
    dynamicTemplates?: Array<Record<string, MappingDynamicTemplate>>;
}
export declare const getComponentTemplateFromFieldMap: ({ name, fieldMap, dynamic, includeSettings, dynamicTemplates, }: GetComponentTemplateFromFieldMapOpts) => ClusterPutComponentTemplateRequest;
