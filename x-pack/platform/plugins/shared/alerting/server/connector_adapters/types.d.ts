import type { ObjectType } from '@kbn/config-schema';
import type { RuleTypeParams, SanitizedRule } from '../../common';
import type { CombinedSummarizedAlerts } from '../types';
type Rule = Pick<SanitizedRule<RuleTypeParams>, 'id' | 'name' | 'tags' | 'consumer'> & {
    producer: string;
    ruleTypeId: string;
};
export interface ConnectorAdapterParams {
    [x: string]: unknown;
}
interface BuildActionParamsArgs<RuleActionParams> {
    alerts: CombinedSummarizedAlerts;
    rule: Rule;
    params: RuleActionParams;
    spaceId: string;
    ruleUrl?: string;
}
export interface ConnectorAdapter<RuleActionParams extends ConnectorAdapterParams = ConnectorAdapterParams, ConnectorParams extends ConnectorAdapterParams = ConnectorAdapterParams> {
    connectorTypeId: string;
    /**
     * The schema of the action persisted
     * in the rule. The schema will be validated
     * when a rule is created or updated.
     * The schema should be backwards compatible
     * and should never introduce any breaking
     * changes.
     */
    ruleActionParamsSchema: ObjectType;
    buildActionParams: (args: BuildActionParamsArgs<RuleActionParams>) => ConnectorParams;
    getKibanaPrivileges?: (args: {
        consumer: string;
        producer: string;
    }) => string[];
}
export {};
