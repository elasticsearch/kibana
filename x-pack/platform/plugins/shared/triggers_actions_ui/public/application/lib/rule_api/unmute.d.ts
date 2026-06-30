import type { HttpSetup } from '@kbn/core/public';
export declare function unmuteRule({ id, http }: {
    id: string;
    http: HttpSetup;
}): Promise<void>;
export declare function unmuteRules({ ids, http, }: {
    ids: string[];
    http: HttpSetup;
}): Promise<void>;
