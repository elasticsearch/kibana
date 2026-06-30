import { RuleNotifyWhen } from '@kbn/alerting-types';
import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { RuleFormData } from '../types';
export * from './routes';
export * from './rule_flapping';
export declare const VIEW_LICENSE_OPTIONS_LINK = "https://www.elastic.co/subscriptions";
export declare const DEFAULT_RULE_INTERVAL = "1m";
export declare const ALERTING_FEATURE_ID = "alerts";
export declare const DEFAULT_FREQUENCY: {
    notifyWhen: RuleNotifyWhen;
    throttle: null;
    summary: boolean;
};
export declare const getDefaultFormData: ({ ruleTypeId, name, consumer, schedule, actions, }: {
    ruleTypeId: RuleFormData["ruleTypeId"];
    name: RuleFormData["name"];
    consumer: RuleFormData["consumer"];
    actions?: RuleFormData["actions"];
    schedule?: RuleFormData["schedule"];
}) => {
    tags: never[];
    params: {};
    schedule: import("@kbn/alerting-types").IntervalSchedule;
    consumer: string;
    ruleTypeId: string | undefined;
    name: string;
    actions: import("@kbn/alerts-ui-shared/src/common/types/rule_types").RuleUiAction[];
    alertDelay: {
        active: number;
    };
};
export declare const MULTI_CONSUMER_RULE_TYPE_IDS: string[];
export declare const DEFAULT_VALID_CONSUMERS: RuleCreationValidConsumer[];
export declare const CREATE_RULE_ROUTE: "/rule/create/:ruleTypeId";
export declare const EDIT_RULE_ROUTE: "/rule/edit/:id";
export declare const LLM_CONNECTOR_IDS: readonly string[];
export declare const isLLMConnectorTypeId: (id: string) => boolean;
export declare enum RuleFormStepId {
    DEFINITION = "rule-definition",
    ACTIONS = "rule-actions",
    DETAILS = "rule-details"
}
