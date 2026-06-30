import type { HttpSetup } from '@kbn/core/public';
export declare function muteRule({ id, http }: {
    id: string;
    http: HttpSetup;
}): Promise<void>;
export declare function muteRules({ ids, http }: {
    ids: string[];
    http: HttpSetup;
}): Promise<void>;
