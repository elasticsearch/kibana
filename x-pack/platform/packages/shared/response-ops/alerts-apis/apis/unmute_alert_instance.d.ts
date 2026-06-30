import type { HttpStart } from '@kbn/core-http-browser';
export interface UnmuteAlertInstanceParams {
    id: string;
    instanceId: string;
    http: HttpStart;
}
export declare const unmuteAlertInstance: ({ id, instanceId, http }: UnmuteAlertInstanceParams) => Promise<void>;
