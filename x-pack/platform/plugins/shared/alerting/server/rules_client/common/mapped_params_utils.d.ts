import type { RuleTypeParams, MappedParams, MappedParamsProperties } from '../../types';
import type { IterateFilterKureyNodeParams } from './validate_attributes';
export declare const MAPPED_PARAMS_PROPERTIES: Array<keyof MappedParamsProperties>;
/**
 * Returns the mapped_params object when given a params object.
 * The function will match params present in MAPPED_PARAMS_PROPERTIES and
 * return an empty object if nothing is matched.
 */
export declare const getMappedParams: (params: RuleTypeParams) => MappedParams;
/**
 * Returns a string of the filter, but with params replaced with mapped_params.
 * This function will check both camel and snake case to make sure we're consistent
 * with the naming
 *
 * i.e.: 'alerts.attributes.params.riskScore' -> 'alerts.attributes.mapped_params.risk_score'
 */
export declare const getModifiedFilter: (filter: string) => string;
/**
 * Returns modified field with mapped_params instead of params.
 *
 * i.e.: 'params.riskScore' -> 'mapped_params.risk_score'
 */
export declare const getModifiedField: (field: string | undefined) => string | undefined;
/**
 * Returns modified search fields with mapped_params instead of params.
 *
 * i.e.:
 * [
 *    'params.riskScore',
 *    'params.severity',
 * ]
 * ->
 * [
 *    'mapped_params.riskScore',
 *    'mapped_params.severity',
 * ]
 */
export declare const getModifiedSearchFields: (searchFields: string[] | undefined) => string[] | undefined;
export declare const getModifiedValue: (key: string, value: string) => string;
export declare const getModifiedSearch: (searchFields: string | string[] | undefined, value: string) => string;
export declare const modifyFilterKueryNode: ({ astFilter, hasNestedKey, nestedKeys, storeValue, path, }: IterateFilterKureyNodeParams) => void;
