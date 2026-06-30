import type { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
export declare const MIN_SIZE = 10;
export declare const MAX_SIZE = 10000;
/** currently the same shape as "fields" property in the ES response */
export type MaybeRawData = SearchResponse['fields'] | undefined;
