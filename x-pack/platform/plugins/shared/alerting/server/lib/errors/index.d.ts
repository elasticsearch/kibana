import type { ErrorThatHandlesItsOwnResponse, ElasticsearchError } from './types';
import { getEsErrorMessage } from './es_error_parser';
export declare function isErrorThatHandlesItsOwnResponse(e: ErrorThatHandlesItsOwnResponse): e is ErrorThatHandlesItsOwnResponse;
export type { ErrorThatHandlesItsOwnResponse, ElasticsearchError };
export { getEsErrorMessage };
export type { RuleTypeDisabledReason } from './rule_type_disabled';
export { RuleTypeDisabledError } from './rule_type_disabled';
export { RuleMutedError } from './rule_muted';
