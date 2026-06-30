import type { HttpStart } from '@kbn/core-http-browser';
export interface MuteAlertInstanceParams {
    id: string;
    instanceId: string;
    http: HttpStart;
}
export declare const muteAlertInstance: ({ id, instanceId, http }: MuteAlertInstanceParams) => Promise<void>;
