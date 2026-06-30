import type { HttpStart } from '@kbn/core-http-browser';
import type { UiConfig } from '.';
export declare const fetchUiConfig: ({ http }: {
    http: HttpStart;
}) => Promise<UiConfig>;
