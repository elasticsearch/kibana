import React from 'react';
import type { Option } from 'fp-ts/Option';
import type { ActionTypeExecutorResult } from '@kbn/actions-plugin/common';
import type { ActionConnector, ActionTypeRegistryContract } from '../../../types';
export interface TestConnectorFormProps {
    connector: ActionConnector;
    executeEnabled: boolean;
    isExecutingAction: boolean;
    onEditAction: (field: string, value: unknown) => void;
    actionParams: Record<string, unknown>;
    onExecutionAction: () => Promise<void>;
    executionResult: Option<ActionTypeExecutorResult<unknown> | undefined>;
    actionTypeRegistry: ActionTypeRegistryContract;
}
export declare const TestConnectorForm: ({ connector, executeEnabled, executionResult, actionParams, onEditAction, onExecutionAction, isExecutingAction, actionTypeRegistry, }: TestConnectorFormProps) => React.JSX.Element;
export { TestConnectorForm as default };
