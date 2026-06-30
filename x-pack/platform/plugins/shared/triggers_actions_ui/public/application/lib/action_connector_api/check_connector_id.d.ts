import type { HttpSetup } from '@kbn/core/public';
export interface CheckConnectorIdResponse {
    isAvailable: boolean;
}
export declare function checkConnectorIdAvailability({ http, id, }: {
    http: HttpSetup;
    id: string;
}): Promise<CheckConnectorIdResponse>;
