import type { HttpSetup } from '@kbn/core/public';
export declare function runSoon({ id, http }: {
    id: string;
    http: HttpSetup;
}): Promise<string>;
