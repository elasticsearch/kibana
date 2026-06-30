import type { HttpSetup } from '@kbn/core-http-browser';
import type { ResolvedRule } from '../../types';
export declare function resolveRule({ http, id, }: {
    http: HttpSetup;
    id: string;
}): Promise<ResolvedRule>;
