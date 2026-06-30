import React from 'react';
import type { HttpStart } from '@kbn/core-http-browser';
import type { ToastsStart } from '@kbn/core-notifications-browser';
import type { RuleTypeModel } from '@kbn/alerts-ui-shared';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import { type RuleTypeModalProps } from './rule_type_modal';
export interface RuleTypeModalComponentProps {
    http: HttpStart;
    toasts: ToastsStart;
    cps?: CPSPluginStart;
    filteredRuleTypes: string[];
    registeredRuleTypes: RuleTypeModel[];
    onClose: RuleTypeModalProps['onClose'];
    onSelectRuleType: RuleTypeModalProps['onSelectRuleType'];
    onSelectTemplate: RuleTypeModalProps['onSelectTemplate'];
}
export declare const RuleTypeModalComponent: React.FC<RuleTypeModalComponentProps>;
