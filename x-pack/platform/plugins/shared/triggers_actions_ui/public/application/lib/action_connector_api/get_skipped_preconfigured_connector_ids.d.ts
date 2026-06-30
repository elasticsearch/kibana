import type { HttpSetup } from '@kbn/core/public';
export interface SkippedPreconfiguredConnectorIdsResponse {
    skippedPreconfiguredConnectorIds: string[];
}
export declare const getSkippedPreconfiguredConnectorIds: ({ http, }: {
    http: HttpSetup;
}) => Promise<SkippedPreconfiguredConnectorIdsResponse>;
