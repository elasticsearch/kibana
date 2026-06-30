import type { UnionTypeOptions } from '@kbn/config-schema/src/types';
export declare const stringOrStringArraySchema: (options?: UnionTypeOptions<string | string[]>) => import("@kbn/config-schema").Type<string | string[]>;
export declare const excludedGapReasonsSchema: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[]>;
export declare const optionalExcludedGapReasonsSchema: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
