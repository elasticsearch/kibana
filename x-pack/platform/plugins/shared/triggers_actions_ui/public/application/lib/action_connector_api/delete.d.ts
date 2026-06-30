import type { HttpSetup } from '@kbn/core/public';
export declare function deleteActions({ ids, http, }: {
    ids: string[];
    http: HttpSetup;
}): Promise<{
    successes: string[];
    errors: string[];
}>;
