import type { HttpSetup } from '@kbn/core-http-browser';
import type { IToasts } from '@kbn/core-notifications-browser';
export declare function runRule(http: HttpSetup, toasts: IToasts, id: string): Promise<void>;
