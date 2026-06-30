import type { RuleActionParams } from '@kbn/alerting-types';
import type { RuleFormActionsErrors, RuleFormParamsErrors, RuleUiAction } from '../common';
import type { RuleFormData, RuleFormState } from '../types';
export type RuleFormStateReducerAction = {
    type: 'setRule';
    payload: RuleFormData;
} | {
    type: 'setRuleProperty';
    payload: {
        property: string;
        value: unknown;
    };
} | {
    type: 'setName';
    payload: RuleFormData['name'];
} | {
    type: 'setTags';
    payload: RuleFormData['tags'];
} | {
    type: 'setParams';
    payload: RuleFormData['params'];
} | {
    type: 'setParamsProperty';
    payload: {
        property: string;
        value: unknown;
    };
} | {
    type: 'setSchedule';
    payload: RuleFormData['schedule'];
} | {
    type: 'setAlertDelay';
    payload: RuleFormData['alertDelay'];
} | {
    type: 'setNotifyWhen';
    payload: RuleFormData['notifyWhen'];
} | {
    type: 'setConsumer';
    payload: RuleFormData['consumer'];
} | {
    type: 'setMultiConsumer';
    payload: RuleFormState['multiConsumerSelection'];
} | {
    type: 'setMetadata';
    payload: Record<string, unknown>;
} | {
    type: 'addAction';
    payload: RuleUiAction;
} | {
    type: 'removeAction';
    payload: {
        uuid: string;
    };
} | {
    type: 'setActionProperty';
    payload: {
        uuid: string;
        key: string;
        value: unknown;
    };
} | {
    type: 'setActionParams';
    payload: {
        uuid: string;
        value: RuleActionParams;
    };
} | {
    type: 'setActionError';
    payload: {
        uuid: string;
        errors: RuleFormActionsErrors;
    };
} | {
    type: 'setActionParamsError';
    payload: {
        uuid: string;
        errors: RuleFormParamsErrors;
    };
} | {
    type: 'runValidation';
} | {
    type: 'setTouched';
};
export declare const ruleFormStateReducer: (ruleFormState: RuleFormState, action: RuleFormStateReducerAction) => RuleFormState;
