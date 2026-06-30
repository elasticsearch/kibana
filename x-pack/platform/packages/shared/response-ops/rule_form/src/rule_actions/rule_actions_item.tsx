/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React, { Suspense, useCallback, useMemo, useState } from 'react';
import type { RecursivePartial } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiAccordion,
  EuiPanel,
  EuiButtonIcon,
  useEuiTheme,
  EuiIconTip,
  EuiText,
  EuiToolTip,
  EuiBadge,
  EuiBetaBadge,
  EuiEmptyPrompt,
  EuiSpacer,
  EuiTitle,
  EuiHorizontalRule,
} from '@elastic/eui';
import type {
  ActionVariable,
  AlertsFilter,
  AlertsFilterTimeframe,
  RuleAction,
  RuleActionFrequency,
  RuleActionParam,
  RuleActionParams,
} from '@kbn/alerting-types';
import type { ActionConnector, UserConfiguredActionConnector } from '@kbn/alerts-ui-shared';
import {
  checkActionFormActionTypeEnabled,
  getAvailableActionVariables,
} from '@kbn/alerts-ui-shared';
import { isEmpty, some } from 'lodash';
import { css } from '@emotion/react';
import type { SavedObjectAttribute } from '@kbn/core/types';
import { useRuleFormDispatch, useRuleFormState } from '../hooks';
import type { RuleFormParamsErrors } from '../common/types';
import { validateAction, validateParamsForWarnings } from '../validation';

import { RuleActionsSettings } from './rule_actions_settings';
import { getDefaultParams, getSelectedActionGroup } from '../utils';
import { RuleActionsMessage } from './rule_actions_message';
import {
  ACTION_ERROR_TOOLTIP,
  ACTION_UNABLE_TO_LOAD_CONNECTOR_DESCRIPTION,
  ACTION_UNABLE_TO_LOAD_CONNECTOR_TITLE,
  ACTION_WARNING_TITLE,
  TECH_PREVIEW_DESCRIPTION,
  TECH_PREVIEW_LABEL,
  ADD_ACTION_SETTINGS_LABEL,
  ADD_ACTION_MESSAGE_LABEL,
} from '../translations';

const SUMMARY_GROUP_TITLE = i18n.translate(
  'responseOpsRuleForm.ruleActionsItem.summaryGroupTitle',
  {
    defaultMessage: 'Summary of alerts',
  }
);

const RUN_WHEN_GROUP_TITLE = (groupName: string) =>
  i18n.translate('responseOpsRuleForm.ruleActionsItem.runWhenGroupTitle', {
    defaultMessage: 'Run when {groupName}',
    values: {
      groupName,
    },
  });

const ACTION_TITLE = (connector: ActionConnector) =>
  i18n.translate('responseOpsRuleForm.ruleActionsItem.existingAlertActionTypeEditTitle', {
    defaultMessage: '{actionConnectorName}',
    values: {
      actionConnectorName: `${connector.name} ${
        connector.isPreconfigured ? '(preconfigured)' : ''
      }`,
    },
  });

export interface RuleActionsItemProps {
  action: RuleAction;
  index: number;
  producerId: string;
}

type ParamsType = RecursivePartial<any>;

export const RuleActionsItem = (props: RuleActionsItemProps) => {
  const { action, index, producerId } = props;

  const {
    plugins: { actionTypeRegistry, http },
    actionsParamsErrors = {},
    selectedRuleType,
    selectedRuleTypeModel,
    connectors,
    connectorTypes,
    alertFields,
  } = useRuleFormState();

  const { euiTheme } = useEuiTheme();
  const subdued = euiTheme.colors.lightestShade;
  const plain = euiTheme.colors.backgroundBasePlain;

  const [availableActionVariables, setAvailableActionVariables] = useState<ActionVariable[]>(() => {
    if (!selectedRuleType.actionVariables) {
      return [];
    }

    const selectedActionGroup = getSelectedActionGroup({
      group: action.group,
      ruleType: selectedRuleType,
      ruleTypeModel: selectedRuleTypeModel,
    });

    return getAvailableActionVariables(
      selectedRuleType.actionVariables,
      // TODO: this is always undefined for now, might need to make this a prop later on
      undefined,
      selectedActionGroup,
      !!action.frequency?.summary
    );
  });

  const [useDefaultMessage, setUseDefaultMessage] = useState(false);

  const [storedActionParamsForAadToggle, setStoredActionParamsForAadToggle] = useState<
    Record<string, SavedObjectAttribute>
  >({});

  const [warning, setWarning] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(true);

  const dispatch = useRuleFormDispatch();
  const actionTypeModel = actionTypeRegistry.get(action.actionTypeId);
  const actionType = connectorTypes.find(({ id }) => id === action.actionTypeId);
  const connector = connectors.find(({ id }) => id === action.id);

  const showActionGroupErrorIcon = useMemo(() => {
    const actionParamsError = actionsParamsErrors[action.uuid!] || {};
    return !isOpen && some(actionParamsError, (error) => !isEmpty(error));
  }, [isOpen, action, actionsParamsErrors]);

  const selectedActionGroup = getSelectedActionGroup({
    group: action.group,
    ruleType: selectedRuleType,
    ruleTypeModel: selectedRuleTypeModel,
  });

  const templateFields = action.useAlertDataForTemplate ? alertFields : availableActionVariables;

  const checkEnabledResult = useMemo(() => {
    if (!actionType) {
      return null;
    }
    return checkActionFormActionTypeEnabled(
      actionType,
      connectors.filter((c) => c.isPreconfigured)
    );
  }, [actionType, connectors]);

  const hasConnectorConfig = (
    currentConnector: ActionConnector
  ): currentConnector is UserConfiguredActionConnector<
    Record<string, unknown>,
    Record<string, unknown>
  > => 'config' in currentConnector;

  const connectorConfig = connector && hasConnectorConfig(connector) ? connector.config : undefined;

  const onDelete = (id: string) => {
    dispatch({ type: 'removeAction', payload: { uuid: id } });
  };

  const validateActionBase = useCallback(
    (newAction: RuleAction) => {
      const errors = validateAction({ action: newAction });
      dispatch({
        type: 'setActionError',
        payload: {
          uuid: newAction.uuid!,
          errors,
        },
      });
    },
    [dispatch]
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
    [actionTypeRegistry, action, dispatch, connectorConfig]
  );

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

  const onAvailableActionVariablesChange = useCallback(
    ({ actionGroup, summary: isSummaryAction }: { actionGroup: string; summary?: boolean }) => {
      const messageVariables = selectedRuleType.actionVariables;

      if (!messageVariables) {
        setAvailableActionVariables([]);
        return;
      }

      const newSelectedActionGroup = getSelectedActionGroup({
        group: actionGroup,
        ruleType: selectedRuleType,
        ruleTypeModel: selectedRuleTypeModel,
      });

      setAvailableActionVariables(
        getAvailableActionVariables(
          messageVariables,
          undefined,
          newSelectedActionGroup,
          !!isSummaryAction
        )
      );
    },
    [selectedRuleType, selectedRuleTypeModel]
  );

  const setDefaultParams = useCallback(
    (actionGroup: string) => {
      const defaultParams = getDefaultParams({
        group: actionGroup,
        ruleType: selectedRuleType,
        actionTypeModel,
      });

      if (!defaultParams) {
        return;
      }
      const newDefaultParams: ParamsType = {};
      const defaultAADParams: ParamsType = {};
      for (const [key, paramValue] of Object.entries(defaultParams)) {
        newDefaultParams[key] = paramValue;
        // Collects AAD params by checking if the value is {x}.{y}
        if (typeof paramValue !== 'string' || !paramValue.match(/{{.*?}}/g)) {
          defaultAADParams[key] = paramValue;
        }
      }
      const newParams = {
        ...action.params,
        ...newDefaultParams,
      };
      dispatch({
        type: 'setActionParams',
        payload: {
          uuid: action.uuid!,
          value: newParams,
        },
      });
      validateActionParams(newParams);
      onStoredActionParamsChange(defaultAADParams, newParams);
    },
    [
      action,
      dispatch,
      validateActionParams,
      selectedRuleType,
      actionTypeModel,
      onStoredActionParamsChange,
    ]
  );

  const onDefaultParamsChange = useCallback(
    (actionGroup: string, summary?: boolean) => {
      onAvailableActionVariablesChange({
        actionGroup,
        summary,
      });
      setDefaultParams(actionGroup);
    },
    [onAvailableActionVariablesChange, setDefaultParams]
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

  const onNotifyWhenChange = useCallback(
    (frequency: RuleActionFrequency) => {
      dispatch({
        type: 'setActionProperty',
        payload: {
          uuid: action.uuid!,
          key: 'frequency',
          value: frequency,
        },
      });
      if (frequency.summary !== action.frequency?.summary) {
        onDefaultParamsChange(action.group, frequency.summary);
      }
    },
    [action, onDefaultParamsChange, dispatch]
  );

  const onActionGroupChange = useCallback(
    (group: string) => {
      dispatch({
        type: 'setActionProperty',
        payload: {
          uuid: action.uuid!,
          key: 'group',
          value: group,
        },
      });
      onDefaultParamsChange(group, action.frequency?.summary);
    },
    [action, onDefaultParamsChange, dispatch]
  );

  const onAlertsFilterChange = useCallback(
    (query?: AlertsFilter['query']) => {
      const newAlertsFilter = {
        ...action.alertsFilter,
        query,
      };

      if (!newAlertsFilter.query) {
        delete newAlertsFilter.query;
      }

      const alertsFilter = isEmpty(newAlertsFilter) ? undefined : newAlertsFilter;

      const newAction = {
        ...action,
        alertsFilter,
      };

      dispatch({
        type: 'setActionProperty',
        payload: {
          uuid: action.uuid!,
          key: 'alertsFilter',
          value: alertsFilter,
        },
      });
      validateActionBase(newAction);
    },
    [action, dispatch, validateActionBase]
  );

  const onTimeframeChange = useCallback(
    (timeframe?: AlertsFilterTimeframe) => {
      const newAlertsFilter = {
        ...action.alertsFilter,
        timeframe,
      };

      if (!newAlertsFilter.timeframe) {
        delete newAlertsFilter.timeframe;
      }

      const alertsFilter = isEmpty(newAlertsFilter) ? undefined : newAlertsFilter;

      const newAction = {
        ...action,
        alertsFilter,
      };

      dispatch({
        type: 'setActionProperty',
        payload: {
          uuid: action.uuid!,
          key: 'alertsFilter',
          value: alertsFilter,
        },
      });
      validateActionBase(newAction);
    },
    [action, dispatch, validateActionBase]
  );

  const onUseAadTemplateFieldsChange = useCallback(() => {
    dispatch({
      type: 'setActionProperty',
      payload: {
        uuid: action.uuid!,
        key: 'useAlertDataForTemplate',
        value: !!!action.useAlertDataForTemplate,
      },
    });

    const currentActionParams = { ...action.params };
    const newActionParams: RuleActionParams = {};
    for (const key of Object.keys(currentActionParams)) {
      newActionParams[key] = storedActionParamsForAadToggle[key] ?? '';
    }

    dispatch({
      type: 'setActionParams',
      payload: {
        uuid: action.uuid!,
        value: newActionParams,
      },
    });

    setStoredActionParamsForAadToggle(currentActionParams);
  }, [action, storedActionParamsForAadToggle, dispatch]);

  const accordionContent = useMemo(() => {
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
        direction="column"
        style={{
          padding: euiTheme.size.l,
          backgroundColor: plain,
          borderRadius: euiTheme.border.radius.medium,
        }}
      >
        <EuiFlexItem>
          <EuiTitle size="xxs">
            <h4>{ADD_ACTION_SETTINGS_LABEL}</h4>
          </EuiTitle>
          <EuiSpacer size="s" />
          <RuleActionsSettings
            action={action}
            onUseDefaultMessageChange={() => setUseDefaultMessage(true)}
            onNotifyWhenChange={onNotifyWhenChange}
            onActionGroupChange={onActionGroupChange}
            onAlertsFilterChange={onAlertsFilterChange}
            onTimeframeChange={onTimeframeChange}
          />
        </EuiFlexItem>
        <EuiHorizontalRule margin="s" />
        <EuiFlexItem>
          <EuiTitle size="xxs">
            <h4>{ADD_ACTION_MESSAGE_LABEL}</h4>
          </EuiTitle>
          <EuiSpacer size="s" />
          <RuleActionsMessage
            action={action}
            index={index}
            useDefaultMessage={useDefaultMessage}
            connector={connector}
            producerId={producerId}
            warning={warning}
            templateFields={templateFields}
            onParamsChange={onParamsChange}
            onUseAadTemplateFieldsChange={onUseAadTemplateFieldsChange}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }, [
    action,
    connector,
    producerId,
    euiTheme,
    plain,
    index,
    templateFields,
    useDefaultMessage,
    warning,
    checkEnabledResult,
    onNotifyWhenChange,
    onActionGroupChange,
    onAlertsFilterChange,
    onTimeframeChange,
    onParamsChange,
    onUseAadTemplateFieldsChange,
  ]);

  const noConnectorContent = useMemo(() => {
    return (
      <EuiEmptyPrompt
        iconType="magnifyExclamation"
        title={<h2>{ACTION_UNABLE_TO_LOAD_CONNECTOR_TITLE}</h2>}
        body={ACTION_UNABLE_TO_LOAD_CONNECTOR_DESCRIPTION}
      />
    );
  }, []);

  const accordionIcon = useMemo(() => {
    if (!connector || !actionType) {
      return (
        <EuiFlexItem grow={false}>
          <EuiIconTip
            content={ACTION_UNABLE_TO_LOAD_CONNECTOR_TITLE}
            type="warning"
            color="danger"
            size="l"
            iconProps={{
              'data-test-subj': 'action-group-error-icon',
            }}
          />
        </EuiFlexItem>
      );
    }

    return (
      <EuiFlexItem grow={false}>
        {showActionGroupErrorIcon ? (
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
            <EuiIconTip content={actionType.name} type={actionTypeModel.iconClass} size="l" />
          </Suspense>
        )}
      </EuiFlexItem>
    );
  }, [connector, showActionGroupErrorIcon, actionType, actionTypeModel.iconClass]);

  const connectorTitle = useMemo(() => {
    const title = connector ? ACTION_TITLE(connector) : actionTypeModel.actionTypeTitle;
    return (
      <EuiFlexItem grow={false} className=".eui-textBreakWord">
        <EuiText size="s">{title}</EuiText>
      </EuiFlexItem>
    );
  }, [connector, actionTypeModel]);

  const runWhenTitle = useMemo(() => {
    if (!connector) {
      return null;
    }
    if (isOpen) {
      return null;
    }
    if (selectedActionGroup || action.frequency?.summary) {
      return (
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={
              action.frequency?.summary
                ? SUMMARY_GROUP_TITLE
                : RUN_WHEN_GROUP_TITLE(selectedActionGroup!.name.toLocaleLowerCase())
            }
          >
            <EuiBadge tabIndex={0} iconType="clock" />
          </EuiToolTip>
        </EuiFlexItem>
      );
    }
  }, [connector, isOpen, selectedActionGroup, action]);

  const warningIcon = useMemo(() => {
    if (!connector) {
      return null;
    }
    if (isOpen) {
      return null;
    }
    if (warning) {
      return (
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
      );
    }
  }, [connector, isOpen, warning]);

  return (
    <EuiAccordion
      initialIsOpen
      data-test-subj="ruleActionsItem"
      borders="all"
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
            data-test-subj="ruleActionsItemDeleteButton"
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
        <EuiPanel color="transparent" paddingSize="m">
          <EuiFlexGroup alignItems="center" responsive={false}>
            {accordionIcon}
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
              {connectorTitle}
              {actionTypeModel.isExperimental && (
                <EuiFlexItem grow={false}>
                  <EuiBetaBadge
                    alignment="middle"
                    data-test-subj="ruleActionsSystemActionsItemBetaBadge"
                    label={TECH_PREVIEW_LABEL}
                    tooltipContent={TECH_PREVIEW_DESCRIPTION}
                  />
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
            <EuiFlexGroup justifyContent="flexEnd" gutterSize="xs" responsive={false}>
              {runWhenTitle}
              {warningIcon}
            </EuiFlexGroup>
          </EuiFlexGroup>
        </EuiPanel>
      }
    >
      {connector && accordionContent}
      {!connector && noConnectorContent}
    </EuiAccordion>
  );
};
