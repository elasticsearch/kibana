/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiAccordion,
  EuiBadge,
  EuiBetaBadge,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiPanel,
  EuiText,
  EuiToolTip,
  useEuiBackgroundColor,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { RuleActionParam, RuleSystemAction } from '@kbn/alerting-types';
import type { IsDisabledResult, IsEnabledResult, ActionConnector } from '@kbn/alerts-ui-shared';
import {
  getAvailableActionVariables,
  checkActionFormActionTypeEnabled,
} from '@kbn/alerts-ui-shared';
import type { SavedObjectAttribute } from '@kbn/core/types';
import { i18n } from '@kbn/i18n';
import { isEmpty, some } from 'lodash';
import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { useRuleFormDispatch, useRuleFormState } from '../hooks';
import type { RuleFormParamsErrors } from '../common';
import {
  ACTION_ERROR_TOOLTIP,
  ACTION_WARNING_TITLE,
  TECH_PREVIEW_DESCRIPTION,
  TECH_PREVIEW_LABEL,
} from '../translations';
import { validateParamsForWarnings } from '../validation';
import { RuleActionsMessage } from './rule_actions_message';

interface RuleActionsSystemActionsItemProps {
  action: RuleSystemAction;
  index: number;
  producerId: string;
}

interface SystemActionAccordionContentProps extends RuleActionsSystemActionsItemProps {
  connector: ActionConnector;
  checkEnabledResult?: IsEnabledResult | IsDisabledResult | null;
  warning?: string | null;
  onParamsChange: (key: string, value: RuleActionParam) => void;
}

const SystemActionAccordionContent: React.FC<SystemActionAccordionContentProps> = React.memo(
  ({ connector, checkEnabledResult, action, index, producerId, warning, onParamsChange }) => {
    const { alertFields } = useRuleFormState();
    const { euiTheme } = useEuiTheme();
    const plain = useEuiBackgroundColor('plain');

    if (!connector || !checkEnabledResult) {
      return null;
    }

    if (!checkEnabledResult.isEnabled) {
      return (
        <EuiFlexGroup
          direction="column"
          style={{
            padding: euiTheme.size.l,
            backgroundColor: plain,
            borderRadius: euiTheme.border.radius.medium,
          }}
        >
          <EuiFlexItem>{checkEnabledResult.messageCard}</EuiFlexItem>
        </EuiFlexGroup>
      );
    }

    return (
      <EuiFlexGroup
        data-test-subj="ruleActionsSystemActionsItemAccordionContent"
        direction="column"
        style={{
          padding: euiTheme.size.l,
          backgroundColor: plain,
        }}
      >
        <EuiFlexItem>
          <RuleActionsMessage
            useDefaultMessage
            action={action}
            index={index}
            connector={connector}
            producerId={producerId}
            warning={warning}
            templateFields={alertFields}
            onParamsChange={onParamsChange}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
);

export const RuleActionsSystemActionsItem = (props: RuleActionsSystemActionsItemProps) => {
  const { action, index, producerId } = props;

  const {
    plugins: { actionTypeRegistry, http },
    actionsParamsErrors = {},
    selectedRuleType,
    connectorTypes,
    connectors,
  } = useRuleFormState();

  const [isOpen, setIsOpen] = useState(true);
  const [storedActionParamsForAadToggle, setStoredActionParamsForAadToggle] = useState<
    Record<string, SavedObjectAttribute>
  >({});
  const [warning, setWarning] = useState<string | null>(null);

  const { euiTheme } = useEuiTheme();
  const subdued = euiTheme.colors.lightestShade;

  const ruleActionsSystemActionsItemCss = css`
    .actCheckActionTypeEnabled__disabledActionWarningCard {
      background-color: ${subdued};
    }
  `;

  const dispatch = useRuleFormDispatch();
  const actionTypeModel = actionTypeRegistry.get(action.actionTypeId);
  const actionType = connectorTypes.find(({ id }) => id === action.actionTypeId)!;
  const connector = connectors.find(({ id }) => id === action.id)!;

  const actionParamsError = actionsParamsErrors[action.uuid!] || {};

  const availableActionVariables = useMemo(() => {
    const messageVariables = selectedRuleType.actionVariables;

    return messageVariables
      ? getAvailableActionVariables(messageVariables, undefined, undefined, true)
      : [];
  }, [selectedRuleType]);

  const connectorConfig = connector && 'config' in connector ? connector.config : undefined;

  const showActionGroupErrorIcon = (): boolean => {
    return !isOpen && some(actionParamsError, (error) => !isEmpty(error));
  };

  const onDelete = (id: string) => {
    dispatch({ type: 'removeAction', payload: { uuid: id } });
  };

  const onStoredActionParamsChange = useCallback(
    (
      aadParams: Record<string, SavedObjectAttribute>,
      params: Record<string, SavedObjectAttribute>
    ) => {
      if (isEmpty(aadParams) && action.params.subAction) {
        setStoredActionParamsForAadToggle(params);
      } else {
        setStoredActionParamsForAadToggle(aadParams);
      }
    },
    [action]
  );

  const validateActionParams = useCallback(
    async (params: RuleActionParam) => {
      const res: { errors: RuleFormParamsErrors } = await actionTypeRegistry
        .get(action.actionTypeId)
        ?.validateParams(params, connectorConfig);

      dispatch({
        type: 'setActionParamsError',
        payload: {
          uuid: action.uuid!,
          errors: res.errors,
        },
      });
    },
    [actionTypeRegistry, action, connectorConfig, dispatch]
  );

  const onParamsChange = useCallback(
    (key: string, value: RuleActionParam) => {
      const newParams = {
        ...action.params,
        [key]: value,
      };

      dispatch({
        type: 'setActionParams',
        payload: {
          uuid: action.uuid!,
          value: newParams,
        },
      });
      setWarning(
        validateParamsForWarnings({
          value,
          publicBaseUrl: http.basePath.publicBaseUrl,
          actionVariables: availableActionVariables,
        })
      );
      validateActionParams(newParams);
      onStoredActionParamsChange(storedActionParamsForAadToggle, newParams);
    },
    [
      http,
      action,
      availableActionVariables,
      dispatch,
      validateActionParams,
      onStoredActionParamsChange,
      storedActionParamsForAadToggle,
    ]
  );

  const checkEnabledResult = useMemo(() => {
    if (!actionType) {
      return null;
    }
    return checkActionFormActionTypeEnabled(actionType, []);
  }, [actionType]);

  return (
    <EuiAccordion
      data-test-subj="ruleActionsSystemActionsItem"
      initialIsOpen
      borders="all"
      css={ruleActionsSystemActionsItemCss}
      style={{
        backgroundColor: subdued,
        borderRadius: euiTheme.border.radius.medium,
      }}
      id={action.id}
      onToggle={setIsOpen}
      buttonProps={{
        style: {
          width: '100%',
        },
      }}
      arrowProps={{
        css: css`
          margin-left: ${euiTheme.size.m};
        `,
      }}
      extraAction={
        <EuiToolTip
          content={i18n.translate(
            'responseOpsRuleForm.ruleActionsSystemActionsItem.deleteActionAriaLabel',
            { defaultMessage: 'delete action' }
          )}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            data-test-subj="ruleActionsSystemActionsItemDeleteActionButton"
            style={{
              marginRight: euiTheme.size.l,
            }}
            aria-label={i18n.translate(
              'responseOpsRuleForm.ruleActionsSystemActionsItem.deleteActionAriaLabel',
              {
                defaultMessage: 'delete action',
              }
            )}
            iconType="trash"
            color="danger"
            onClick={() => onDelete(action.uuid!)}
          />
        </EuiToolTip>
      }
      buttonContentClassName="eui-fullWidth"
      buttonContent={
        <EuiPanel
          data-test-subj="ruleActionsSystemActionsItemAccordionButton"
          color="transparent"
          paddingSize="m"
        >
          <EuiFlexGroup alignItems="center">
            <EuiFlexItem grow={false}>
              {showActionGroupErrorIcon() ? (
                <EuiIconTip
                  content={ACTION_ERROR_TOOLTIP}
                  type="warning"
                  color="danger"
                  size="l"
                  iconProps={{
                    'data-test-subj': 'action-group-error-icon',
                  }}
                />
              ) : (
                <Suspense fallback={null}>
                  <EuiIconTip
                    content={actionType?.name}
                    size="l"
                    type={actionTypeModel.iconClass}
                  />
                </Suspense>
              )}
            </EuiFlexItem>
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="s">{connector.name}</EuiText>
              </EuiFlexItem>
              {actionTypeModel.isExperimental && (
                <EuiFlexItem grow={false}>
                  <EuiBetaBadge
                    size="s"
                    alignment="middle"
                    data-test-subj="ruleActionsSystemActionsItemBetaBadge"
                    iconType="flask"
                    label={TECH_PREVIEW_LABEL}
                    tooltipContent={TECH_PREVIEW_DESCRIPTION}
                  />
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
            <EuiFlexGroup justifyContent="flexEnd" gutterSize="xs" responsive={false}>
              {warning && !isOpen && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={ACTION_WARNING_TITLE}>
                    <EuiBadge
                      tabIndex={0}
                      data-test-subj="warning-badge"
                      iconType="warning"
                      color="warning"
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexGroup>
        </EuiPanel>
      }
    >
      <SystemActionAccordionContent
        action={action}
        index={index}
        producerId={producerId}
        warning={warning}
        connector={connector}
        checkEnabledResult={checkEnabledResult}
        onParamsChange={onParamsChange}
      />
    </EuiAccordion>
  );
};
