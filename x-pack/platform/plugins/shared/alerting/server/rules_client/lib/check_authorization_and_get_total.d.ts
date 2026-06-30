import type { KueryNode } from '@kbn/es-query';
import type { BulkAction } from '../types';
import type { RulesClientContext } from '../types';
export declare const checkAuthorizationAndGetTotal: (context: RulesClientContext, { filter, action, }: {
    filter: KueryNode | null;
    action: BulkAction;
}) => Promise<{
    total: number;
}>;
