import React from 'react';
import type { KueryNode } from '@kbn/es-query';
import type { ComponentOpts as BulkOperationsComponentOpts } from '../../common/components/with_bulk_rule_api_operations';
import type { RuleTableItem, BulkEditActions } from '../../../../types';
export type BulkSnoozeModalProps = {
    rules: RuleTableItem[];
    filter?: KueryNode | null;
    bulkEditAction?: BulkEditActions;
    numberOfSelectedRules?: number;
    onClose: () => void;
    onSave: () => void;
    setIsBulkEditing: (isLoading: boolean) => void;
    onSearchPopulate?: (filter: string) => void;
} & BulkOperationsComponentOpts;
export declare const BulkSnoozeModal: (props: BulkSnoozeModalProps) => React.JSX.Element | null;
export declare const BulkSnoozeModalWithApi: React.FunctionComponent<import("../../common/components/with_bulk_rule_api_operations").PropsWithOptionalApiHandlers<{
    rules: RuleTableItem[];
    filter?: KueryNode | null;
    bulkEditAction?: BulkEditActions;
    numberOfSelectedRules?: number;
    onClose: () => void;
    onSave: () => void;
    setIsBulkEditing: (isLoading: boolean) => void;
    onSearchPopulate?: (filter: string) => void;
}>>;
