/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiButton,
  EuiButtonGroup,
  EuiCallOut,
  EuiFlyout,
  EuiFlyoutBody,
  EuiLoadingSpinner,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
} from '@elastic/eui';
import type { IconType } from '@elastic/eui';
import { ACTION_TYPE_SOURCES } from '@kbn/actions-types';

import { i18n } from '@kbn/i18n';
import { getConnectorCompatibility, getConnectorFeatureName } from '@kbn/actions-plugin/common';
import { isLLMConnectorTypeId } from '@kbn/response-ops-rule-form/src/constants';
import {
  DEPRECATED_LLM_CONNECTOR_CALLOUT_TITLE,
  DEPRECATED_LLM_CONNECTOR_INFO,
} from '@kbn/response-ops-rule-form/src/translations';
import { CreateConnectorFilter } from './create_connector_filter';
import type {
  ActionConnector,
  ActionType,
  ActionTypeModel,
  ActionTypeIndex,
  ActionTypeRegistryContract,
} from '../../../../types';
import { ActionTypeMenu } from '../action_type_menu';
import type { ResetForm } from '../connector_form';
import { ConnectorForm } from '../connector_form';
import { useConnectorCreateForm } from '../use_connector_create_form';
import { FlyoutHeader } from './header';
import { FlyoutFooter } from './footer';
import { UpgradeLicenseCallOut } from './upgrade_license_callout';

export interface CreateConnectorFlyoutProps {
  actionTypeRegistry: ActionTypeRegistryContract;
  onClose: () => void;
  featureId?: string;
  onConnectorCreated?: (connector: ActionConnector) => void;
  onTestConnector?: (connector: ActionConnector) => void;
  isServerless?: boolean;
  initialConnector?: Partial<Omit<ActionConnector, 'secrets'>> & { actionTypeId: string };
  icon?: IconType;
}

const CreateConnectorFlyoutComponent: React.FC<CreateConnectorFlyoutProps> = ({
  actionTypeRegistry,
  featureId,
  onClose,
  onConnectorCreated,
  onTestConnector,
  initialConnector,
  icon,
}) => {
  const [allActionTypes, setAllActionTypes] = useState<ActionTypeIndex | undefined>(undefined);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [hasActionsUpgradeableByTrial, setHasActionsUpgradeableByTrial] = useState<boolean>(false);
  const [searchValue, setSearchValue] = useState<string>('');
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>(
    featureId ? [featureId] : []
  );

  const {
    actionTypeModel,
    isLoadingActionTypeModel,
    actionTypeModelError,
    refetchConnectorSpec,
    showLoadingSpinner,
    setFormState,
    defaultConnector,
    isSaving,
    isSubmitDisabled: disabled,
    showFormErrors,
    setShowFormErrors,
    preSubmitValidationErrorMessage,
    createConnectorError,
    validateAndCreateConnector,
  } = useConnectorCreateForm({
    actionTypeRegistry,
    actionTypeId: actionType?.id,
    initialConnector,
  });

  useEffect(() => {
    if (initialConnector && allActionTypes && !actionType) {
      const foundActionType = allActionTypes[initialConnector.actionTypeId];
      if (foundActionType) {
        setActionType(foundActionType);
      }
    }
  }, [initialConnector, allActionTypes, actionType]);

  const isUsingInitialConnector = Boolean(initialConnector);
  const hasConnectorTypeSelected = actionType != null;
  // Only stack connectors (not spec-based) support the test tab
  const isTestable = !actionType?.source || actionType.source === ACTION_TYPE_SOURCES.stack;

  const groupActionTypeModel: Array<ActionTypeModel & { name: string }> =
    actionTypeModel && actionTypeModel.subtype
      ? (actionTypeModel?.subtype ?? [])
          .filter(
            (item) =>
              allActionTypes &&
              allActionTypes[item.id].enabledInConfig &&
              actionTypeRegistry.has(item.id)
          )
          .map((subtypeAction) => ({
            ...actionTypeRegistry.get(subtypeAction.id),
            name: subtypeAction.name,
          }))
      : [];

  const groupActionButtons =
    groupActionTypeModel?.length > 1
      ? groupActionTypeModel.map((gAction) => ({
          id: gAction.id,
          label: gAction.name,
          'data-test-subj': `${gAction.id}Button`,
        }))
      : [];

  const resetConnectorForm = useRef<ResetForm | undefined>();

  const setResetForm = useCallback(
    (reset: ResetForm) => {
      resetConnectorForm.current = reset;
      setShowFormErrors(false);
    },
    [setShowFormErrors]
  );

  const onChangeGroupAction = (id: string) => {
    if (allActionTypes && allActionTypes[id]) {
      setActionType(allActionTypes[id]);
      if (resetConnectorForm.current) {
        resetConnectorForm.current({
          resetValues: true,
          defaultValue: {
            actionTypeId: id,
            isDeprecated: false,
            config: {},
            secrets: {},
          },
        });
      }
    }
  };

  const resetActionType = useCallback(() => setActionType(null), []);

  const testConnector = useCallback(async () => {
    const createdConnector = await validateAndCreateConnector();

    if (createdConnector) {
      if (onConnectorCreated) {
        onConnectorCreated(createdConnector);
      }

      if (onTestConnector) {
        onTestConnector(createdConnector);
      }

      onClose();
    }
  }, [validateAndCreateConnector, onClose, onConnectorCreated, onTestConnector]);

  const onSubmit = useCallback(async () => {
    const createdConnector = await validateAndCreateConnector();
    if (createdConnector) {
      if (onConnectorCreated) {
        onConnectorCreated(createdConnector);
      }

      onClose();
    }
  }, [validateAndCreateConnector, onClose, onConnectorCreated]);

  const handleSearchValueChange = useCallback((newValue: string) => {
    setSearchValue(newValue);
  }, []);

  const handleSelectedFeatureIdsChange = useCallback((ids: string[]) => {
    setSelectedFeatureIds(ids);
  }, []);

  const featureFilterOptions = useMemo(() => {
    if (!allActionTypes) {
      return [];
    }
    const uniqueFeatureIds = new Set<string>();
    for (const actionTypeItem of Object.values(allActionTypes)) {
      for (const supportedFeatureId of actionTypeItem.supportedFeatureIds ?? []) {
        uniqueFeatureIds.add(supportedFeatureId);
      }
    }
    return Array.from(uniqueFeatureIds)
      .map((id) => ({ value: id, label: getConnectorFeatureName(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allActionTypes]);

  const [flyoutHeaderName, setFlyoutHeaderName] = useState<string>('Select a connector');
  useEffect(() => {
    if (actionType) {
      if (!actionType.name.toLowerCase().includes('connector')) {
        setFlyoutHeaderName(`${actionType.name} connector`);
      } else {
        setFlyoutHeaderName(actionType.name);
      }
    }
  }, [actionType]);

  const handleErrorFocus = useCallback((node: HTMLDivElement) => {
    node?.focus();
  }, []);

  return (
    <EuiFlyout
      onClose={onClose}
      data-test-subj="create-connector-flyout"
      aria-label={i18n.translate('xpack.triggersActionsUI.createConnectorFlyout', {
        defaultMessage: '{headerName} flyout',
        values: {
          headerName: flyoutHeaderName,
        },
      })}
    >
      <FlyoutHeader
        icon={icon ?? actionTypeModel?.iconClass}
        actionTypeName={flyoutHeaderName}
        actionTypeMessage={actionTypeModel?.selectMessage}
        compatibility={getConnectorCompatibility(actionType?.supportedFeatureIds)}
        isExperimental={actionTypeModel?.isExperimental}
      />
      <EuiFlyoutBody
        banner={!actionType && hasActionsUpgradeableByTrial ? <UpgradeLicenseCallOut /> : null}
      >
        {!hasConnectorTypeSelected && (
          <>
            <CreateConnectorFilter
              searchValue={searchValue}
              onSearchValueChange={handleSearchValueChange}
              selectedFeatureIds={selectedFeatureIds}
              onSelectedFeatureIdsChange={handleSelectedFeatureIdsChange}
              featureOptions={featureFilterOptions}
              featureFilterDisabled={Boolean(featureId)}
            />
            <EuiSpacer size="m" />
          </>
        )}

        {hasConnectorTypeSelected ? (
          <>
            {groupActionButtons.length > 0 && (
              <>
                <EuiButtonGroup
                  isFullWidth
                  buttonSize="m"
                  color="primary"
                  legend=""
                  options={groupActionButtons}
                  idSelected={actionType.id}
                  onChange={onChangeGroupAction}
                  data-test-subj="slackTypeChangeButton"
                />
                <EuiSpacer size="xs" />
              </>
            )}

            {showLoadingSpinner && (
              <EuiFlexGroup
                direction="column"
                justifyContent="center"
                alignItems="center"
                style={{ minHeight: 200 }}
              >
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="xl" />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  {i18n.translate(
                    'xpack.triggersActionsUI.sections.actionConnectorAdd.loadingConnectorConfiguration',
                    {
                      defaultMessage: 'Loading connector configuration...',
                    }
                  )}
                </EuiFlexItem>
              </EuiFlexGroup>
            )}

            {actionTypeModelError && (
              <>
                <EuiCallOut
                  announceOnMount
                  size="s"
                  color="danger"
                  iconType="error"
                  data-test-subj="connector-spec-load-error"
                  title={i18n.translate(
                    'xpack.triggersActionsUI.sections.actionConnectorAdd.specLoadError',
                    {
                      defaultMessage: 'Failed to load connector configuration',
                    }
                  )}
                >
                  <p>
                    {i18n.translate(
                      'xpack.triggersActionsUI.sections.actionConnectorAdd.specLoadErrorDescription',
                      {
                        defaultMessage:
                          'The connector form could not be loaded. Try again, or contact your administrator if the problem persists.',
                      }
                    )}
                  </p>
                  <EuiSpacer size="s" />
                  <EuiButton
                    color="danger"
                    data-test-subj="connector-spec-load-retry"
                    onClick={() => refetchConnectorSpec()}
                  >
                    {i18n.translate(
                      'xpack.triggersActionsUI.sections.actionConnectorAdd.specLoadErrorRetry',
                      { defaultMessage: 'Retry' }
                    )}
                  </EuiButton>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {isLLMConnectorTypeId(actionType.id) && (
              <>
                <EuiCallOut
                  announceOnMount={false}
                  size="s"
                  color="warning"
                  iconType="warning"
                  data-test-subj="deprecatedLLMConnectorCallout"
                  title={DEPRECATED_LLM_CONNECTOR_CALLOUT_TITLE}
                >
                  {DEPRECATED_LLM_CONNECTOR_INFO}
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {showFormErrors && (
              <>
                <EuiCallOut
                  tabIndex={-1}
                  announceOnMount
                  ref={handleErrorFocus}
                  size="s"
                  color="danger"
                  iconType="warning"
                  data-test-subj="connector-form-header-error-label"
                  role="alert"
                  aria-label={i18n.translate(
                    'xpack.triggersActionsUI.sections.actionConnectorAdd.connectorFormErrorDialog',
                    {
                      defaultMessage: 'Connector form error notification',
                    }
                  )}
                  title={i18n.translate(
                    'xpack.triggersActionsUI.sections.actionConnectorAdd.headerFormLabel',
                    {
                      defaultMessage: 'There are errors in the form',
                    }
                  )}
                />
                <EuiSpacer size="m" />
              </>
            )}

            {createConnectorError && (
              <>
                <EuiCallOut
                  announceOnMount
                  size="s"
                  color="danger"
                  iconType="error"
                  data-test-subj="create-connector-api-error"
                  title={createConnectorError.title}
                >
                  <p>{createConnectorError.message}</p>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {!isLoadingActionTypeModel &&
              !showLoadingSpinner &&
              !actionTypeModelError &&
              actionTypeModel && (
                <>
                  <ConnectorForm
                    actionTypeModel={actionTypeModel}
                    connector={defaultConnector}
                    isEdit={false}
                    onChange={setFormState}
                    setResetForm={setResetForm}
                  />
                  {!!preSubmitValidationErrorMessage && <p>{preSubmitValidationErrorMessage}</p>}
                </>
              )}
          </>
        ) : (
          <ActionTypeMenu
            featureId={featureId}
            onActionTypeChange={setActionType}
            setHasActionsUpgradeableByTrial={setHasActionsUpgradeableByTrial}
            setAllActionTypes={setAllActionTypes}
            actionTypeRegistry={actionTypeRegistry}
            searchValue={searchValue}
            selectedFeatureIds={selectedFeatureIds}
          />
        )}
      </EuiFlyoutBody>
      <FlyoutFooter
        hasConnectorTypeSelected={hasConnectorTypeSelected}
        onBack={resetActionType}
        onCancel={onClose}
        isUsingInitialConnector={isUsingInitialConnector}
        onTestConnector={onTestConnector}
        disabled={disabled}
        isSaving={isSaving}
        onSubmit={onSubmit}
        testConnector={testConnector}
        isTestable={isTestable}
      />
    </EuiFlyout>
  );
};

export const CreateConnectorFlyout = memo(CreateConnectorFlyoutComponent);

// eslint-disable-next-line import/no-default-export
export { CreateConnectorFlyout as default };
