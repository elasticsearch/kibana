import React from 'react';
import type { RuleTableItem } from '../../../../types';
import type { ComponentOpts as BulkOperationsComponentOpts } from '../../common/components/with_bulk_rule_api_operations';
export type ComponentOpts = {
    item: RuleTableItem;
    onRuleChanged: () => Promise<void>;
    onLoading: (isLoading: boolean) => void;
    onDeleteRule: (item: RuleTableItem) => void;
    onEditRule: (item: RuleTableItem) => void;
    onUpdateAPIKey: (item: RuleTableItem) => void;
    onRunRule: (item: RuleTableItem) => void;
    onCloneRule: (ruleId: string) => void;
} & Pick<BulkOperationsComponentOpts, 'bulkDisableRules' | 'bulkEnableRules' | 'snoozeRule' | 'unsnoozeRule'>;
export declare const CollapsedItemActions: React.FunctionComponent<ComponentOpts>;
export declare const CollapsedItemActionsWithApi: React.FunctionComponent<import("../../common/components/with_bulk_rule_api_operations").PropsWithOptionalApiHandlers<{
    item: RuleTableItem;
    onRuleChanged: () => Promise<void>;
    onLoading: (isLoading: boolean) => void;
    onDeleteRule: (item: RuleTableItem) => void;
    onEditRule: (item: RuleTableItem) => void;
    onUpdateAPIKey: (item: RuleTableItem) => void;
    onRunRule: (item: RuleTableItem) => void;
    onCloneRule: (ruleId: string) => void;
} & Pick<BulkOperationsComponentOpts, "bulkEnableRules" | "bulkDisableRules" | "snoozeRule" | "unsnoozeRule">>>;
