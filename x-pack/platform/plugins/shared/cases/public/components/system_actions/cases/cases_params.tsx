/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo } from 'react';

import type { ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public/types';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiCheckbox,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiComboBox,
  EuiCallOut,
  EuiToolTip,
} from '@elastic/eui';
import { useAlertsDataView } from '@kbn/alerts-ui-shared/src/common/hooks/use_alerts_data_view';
import { ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID } from '@kbn/elastic-assistant-common';
import type { ServerlessProjectType } from '../../../../common/constants/types';
import * as i18n from './translations';
import type { CasesActionParams } from './types';
import {
  CASES_CONNECTOR_SUB_ACTION,
  DEFAULT_MAX_OPEN_CASES,
  MAX_OPEN_CASES_ADVANCED_SETTING,
  MAX_OPEN_CASES_DEFAULT_MAXIMUM,
  getMaximumOpenCases,
} from '../../../../common/constants';
import { DEFAULT_TIME_WINDOW, TIME_UNITS } from './constants';
import { getTimeUnitOptions } from './utils';
import { useKibana } from '../../../common/lib/kibana';
import { KibanaServices } from '../../../common/lib/kibana/services';
import { TemplateSelector } from '../../create/templates';
import { TemplateSelectorV2 } from './template_selector_v2';
import type { CasesConfigurationUITemplate } from '../../../containers/types';
import { getOwnerFromRuleConsumerProducer } from '../../../../common/utils/owner';
import { getConfigurationByOwner } from '../../../containers/configure/utils';
import { useGetAllCaseConfigurations } from '../../../containers/configure/use_get_all_case_configurations';
import { OptionalFieldLabel } from '../../optional_field_label';

const DEFAULT_EMPTY_TEMPLATE_KEY = 'defaultEmptyTemplateKey';

export const CasesParamsFieldsComponent: React.FunctionComponent<
  ActionParamsProps<CasesActionParams>
> = ({ actionParams, editAction, errors, index, producerId, featureId, ruleTypeId }) => {
  const {
    cloud,
    data: { dataViews: dataViewsService },
    http,
    uiSettings,
    notifications: { toasts },
  } = useKibana().services;

  const serverlessProjectType = cloud?.isServerlessEnabled
    ? (cloud.serverless.projectType as ServerlessProjectType)
    : undefined;

  const owner = getOwnerFromRuleConsumerProducer({
    consumer: featureId,
    producer: producerId,
    // This is a workaround for a very specific bug with the cases action in serverless security
    // More info here: https://github.com/elastic/kibana/issues/195599
    serverlessProjectType,
  });

  const { dataView, isLoading: loadingAlertDataViews } = useAlertsDataView({
    http,
    toasts,
    dataViewsService,
    ruleTypeIds: ruleTypeId ? [ruleTypeId] : [],
  });

  const { data: configurations, isLoading: isLoadingCaseConfiguration } =
    useGetAllCaseConfigurations();

  const currentConfiguration = useMemo(
    () =>
      getConfigurationByOwner({
        configurations,
        owner,
      }),
    [configurations, owner]
  );

  const isAttackDiscoveryRuleType = ruleTypeId === ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID;
  const configuredMaximumOpenCases = useMemo(() => {
    try {
      return getMaximumOpenCases(uiSettings.get<number>(MAX_OPEN_CASES_ADVANCED_SETTING));
    } catch {
      return MAX_OPEN_CASES_DEFAULT_MAXIMUM;
    }
  }, [uiSettings]);

  const isTemplatesV2Enabled = KibanaServices.getConfig()?.templates?.enabled ?? false;

  const { timeWindow, reopenClosedCases, groupingBy, templateId } = useMemo(
    () =>
      actionParams.subActionParams ?? {
        timeWindow: `${DEFAULT_TIME_WINDOW}`,
        reopenClosedCases: false,
        groupingBy: [],
        templateId: null,
        templateVersion: null,
      },
    [actionParams.subActionParams]
  );

  const parsedTimeWindowSize = timeWindow.slice(0, timeWindow.length - 1);
  const parsedTimeWindowUnit = timeWindow.slice(-1);

  const timeWindowSize = isNaN(parseInt(parsedTimeWindowSize, 10))
    ? DEFAULT_TIME_WINDOW[0]
    : parsedTimeWindowSize.toString();

  const timeWindowUnit = Object.values(TIME_UNITS).includes(parsedTimeWindowUnit as TIME_UNITS)
    ? parsedTimeWindowUnit
    : DEFAULT_TIME_WINDOW[1];

  const timeWindowSizeAsNumber = parseInt(timeWindowSize, 10);

  const showTimeWindowWarning =
    timeWindowUnit === 'm' && timeWindowSizeAsNumber >= 5 && timeWindowSizeAsNumber <= 20;

  useEffect(() => {
    if (!actionParams.subAction) {
      editAction('subAction', CASES_CONNECTOR_SUB_ACTION.RUN, index);
    }

    if (!actionParams.subActionParams) {
      editAction(
        'subActionParams',
        {
          timeWindow: `${DEFAULT_TIME_WINDOW}`,
          reopenClosedCases: false,
          groupingBy: [],
          templateId: null,
          templateVersion: null,
        },
        index
      );
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionParams]);

  const editSubActionProperty = useCallback(
    (key: string, value: unknown) => {
      return editAction(
        'subActionParams',
        { ...actionParams.subActionParams, [key]: value },
        index
      );
    },
    [editAction, index, actionParams.subActionParams]
  );

  const handleTimeWindowChange = useCallback(
    (key: 'timeWindowSize' | 'timeWindowUnit', value: string) => {
      if (!value) {
        return;
      }

      const newTimeWindow =
        key === 'timeWindowSize' ? `${value}${timeWindowUnit}` : `${timeWindowSize}${value}`;

      editSubActionProperty('timeWindow', newTimeWindow);
    },
    [editSubActionProperty, timeWindowUnit, timeWindowSize]
  );

  const onChangeComboBox = useCallback(
    (optionsValue: Array<EuiComboBoxOptionOption<string>>) => {
      editSubActionProperty('groupingBy', optionsValue?.length ? [optionsValue[0].value] : []);
    },
    [editSubActionProperty]
  );

  const onChangeMaxCasesToOpend: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      editSubActionProperty('maximumCasesToOpen', Number(event.target.value));
    },
    [editSubActionProperty]
  );

  const options: Array<EuiComboBoxOptionOption<string>> = useMemo(() => {
    if (!dataView) {
      return [];
    }

    return dataView.fields
      .filter((field) => Boolean(field.aggregatable))
      .map((field) => ({
        value: field.name,
        label: field.name,
      }));
  }, [dataView]);

  const selectedOptions = groupingBy.map((field) => ({ value: field, label: field }));
  const selectedTemplate = useMemo(
    () => currentConfiguration.templates.find((t) => t.key === templateId),
    [currentConfiguration.templates, templateId]
  );
  const selectedTemplateHasConnector = !!selectedTemplate?.caseFields?.connector;
  const defaultTemplate = useMemo(() => {
    return {
      key: DEFAULT_EMPTY_TEMPLATE_KEY,
      name: i18n.DEFAULT_EMPTY_TEMPLATE_NAME,
      caseFields: null,
    };
  }, []);

  const onTemplateChange = useCallback(
    ({ key, caseFields }: Pick<CasesConfigurationUITemplate, 'caseFields' | 'key'>) => {
      editSubActionProperty('templateId', key === DEFAULT_EMPTY_TEMPLATE_KEY ? null : key);
    },
    [editSubActionProperty]
  );

  const onV2TemplateChange = useCallback(
    ({
      templateId: newTemplateId,
      templateVersion: newTemplateVersion,
    }: {
      templateId: string | null;
      templateVersion: string | null;
    }) => {
      editAction(
        'subActionParams',
        {
          ...actionParams.subActionParams,
          templateId: newTemplateId,
          templateVersion: newTemplateVersion,
        },
        index
      );
    },
    [actionParams.subActionParams, editAction, index]
  );

  const onAutoPushChange: React.EventHandler<React.ChangeEvent<HTMLInputElement>> = useCallback(
    (event) => {
      editSubActionProperty('autoPushCase', event.target.checked);
    },
    [editSubActionProperty]
  );

  if (isAttackDiscoveryRuleType) {
    return (
      <EuiToolTip
        data-test-subj="case-action-attack-discovery-tooltip"
        content={i18n.ATTACK_DISCOVERY_TEMPLATE_TOOLTIP}
      >
        {isTemplatesV2Enabled ? (
          <TemplateSelectorV2
            owner={owner}
            templateId={templateId ?? null}
            isLoading={isLoadingCaseConfiguration}
            isDisabled={true}
            onChange={onV2TemplateChange}
          />
        ) : (
          <TemplateSelector
            key={currentConfiguration.id}
            isLoading={isLoadingCaseConfiguration}
            templates={[defaultTemplate, ...currentConfiguration.templates]}
            onTemplateChange={onTemplateChange}
            initialTemplate={selectedTemplate}
            isDisabled={true}
          />
        )}
      </EuiToolTip>
    );
  }

  return (
    <>
      <EuiFlexGroup>
        <EuiFlexItem grow={true}>
          <EuiFormRow fullWidth label={i18n.GROUP_BY_ALERT} labelAppend={OptionalFieldLabel}>
            <EuiComboBox
              fullWidth
              isClearable={true}
              singleSelection
              data-test-subj="group-by-alert-field-combobox"
              isLoading={loadingAlertDataViews}
              isDisabled={loadingAlertDataViews}
              options={options}
              onChange={onChangeComboBox}
              selectedOptions={selectedOptions}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFormRow
        fullWidth
        id="timeWindow"
        error={errors.timeWindow as string[]}
        isInvalid={
          errors.timeWindow !== undefined &&
          Number(errors.timeWindow.length) > 0 &&
          timeWindow !== undefined
        }
      >
        <EuiFlexGroup alignItems="flexEnd" gutterSize="s">
          <EuiFlexItem grow={4}>
            <EuiFieldNumber
              prepend={i18n.TIME_WINDOW}
              data-test-subj="time-window-size-input"
              value={timeWindowSize}
              min={1}
              step={1}
              onChange={(e) => {
                handleTimeWindowChange('timeWindowSize', e.target.value);
              }}
              aria-label={i18n.TIME_WINDOW_VALUE_LABEL}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={3}>
            <EuiSelect
              fullWidth
              data-test-subj="time-window-unit-select"
              value={timeWindowUnit}
              onChange={(e) => {
                handleTimeWindowChange('timeWindowUnit', e.target.value);
              }}
              options={getTimeUnitOptions(timeWindowSize)}
              aria-label={i18n.TIME_WINDOW_UNIT_LABEL}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFormRow>
      <EuiSpacer size="s" />
      {showTimeWindowWarning && (
        <EuiCallOut
          announceOnMount
          data-test-subj="show-time-window-warning"
          title={i18n.TIME_WINDOW_WARNING}
          color="warning"
          iconType="warning"
          size="s"
        />
      )}
      <EuiSpacer size="m" />
      <EuiFlexGroup direction="column" gutterSize="m">
        <EuiFlexItem grow={true}>
          {isTemplatesV2Enabled ? (
            <TemplateSelectorV2
              owner={owner}
              templateId={templateId ?? null}
              isLoading={isLoadingCaseConfiguration}
              onChange={onV2TemplateChange}
            />
          ) : (
            <TemplateSelector
              key={currentConfiguration.id}
              isLoading={isLoadingCaseConfiguration}
              templates={[defaultTemplate, ...currentConfiguration.templates]}
              onTemplateChange={onTemplateChange}
              initialTemplate={selectedTemplate}
            />
          )}
        </EuiFlexItem>
        {!isTemplatesV2Enabled && selectedTemplateHasConnector ? (
          <EuiFlexItem grow={true}>
            <EuiCheckbox
              id={`auto-push-case-${index}`}
              data-test-subj="auto-push-case"
              checked={actionParams.subActionParams?.autoPushCase}
              label={i18n.AUTO_PUSH_CASE_LABEL}
              disabled={isLoadingCaseConfiguration}
              onChange={onAutoPushChange}
            />
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup>
        <EuiFlexItem grow={true}>
          <EuiFormRow
            fullWidth
            label={i18n.MAX_CASES_TO_OPEN_LABEL}
            helpText={i18n.MAX_CASES_TO_OPEN_HELP_TEXT(configuredMaximumOpenCases)}
          >
            <EuiFieldNumber
              fullWidth
              min={1}
              max={configuredMaximumOpenCases}
              step={1}
              defaultValue={
                actionParams.subActionParams?.maximumCasesToOpen ?? DEFAULT_MAX_OPEN_CASES
              }
              data-test-subj="maximum-case-to-open-input"
              onChange={onChangeMaxCasesToOpend}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiCheckbox
            id={`reopen-case-${index}`}
            data-test-subj="reopen-case"
            checked={reopenClosedCases}
            label={i18n.REOPEN_WHEN_CASE_IS_CLOSED}
            onChange={(e) => {
              editSubActionProperty('reopenClosedCases', e.target.checked);
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};

CasesParamsFieldsComponent.displayName = 'CasesParamsFields';

export const CasesParamsFields = memo(CasesParamsFieldsComponent);

// default export required for React.Lazy
// eslint-disable-next-line import/no-default-export
export { CasesParamsFields as default };
