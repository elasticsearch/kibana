import type { RulesClientContext } from '../types';
import type { BulkAction } from '../types';
export declare const getAuthorizationFilter: (context: RulesClientContext, { action }: {
    action: BulkAction;
}) => Promise<import("@kbn/utility-types").JsonObject | import("@kbn/es-query").KueryNode | undefined>;
