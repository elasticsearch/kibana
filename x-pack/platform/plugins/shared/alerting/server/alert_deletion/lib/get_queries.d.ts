import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
export declare const getActiveAlertsQuery: (threshold: number, spaceId: string) => QueryDslQueryContainer;
export declare const getInactiveAlertsQuery: (threshold: number, spaceId: string) => QueryDslQueryContainer;
