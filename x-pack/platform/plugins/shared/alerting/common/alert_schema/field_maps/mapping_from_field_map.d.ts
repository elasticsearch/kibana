import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import type { FieldMap } from '@kbn/alerts-as-data-utils';
export declare function mappingFromFieldMap(fieldMap: FieldMap, dynamic?: 'strict' | boolean): MappingTypeMapping;
