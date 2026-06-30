/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ActionConnector, ActionTypeRegistryContract } from '../../../../types';
import { ConnectorForm } from '../connector_form';
import { useConnectorCreateForm } from '../use_connector_create_form';

export interface CreateConnectorFormProps {
  actionTypeRegistry: ActionTypeRegistryContract;
  /** The connector type to create. Pre-selected — no type picker is shown. */
  actionTypeId: string;
  /** Optional name to pre-fill into the form. */
  initialName?: string;
  /** Carried for provider parity (consumed by ConnectorProvider in the wrapper). */
  isServerless?: boolean;
  /** Reports validity/saving so a host (e.g. a flyout/canvas) can drive its own Save button. */
  onStateChange?: (status: CreateConnectorFormStatus) => void;
  /** Hands the host an imperative handle to submit the form. */
  onReady?: (handle: CreateConnectorFormHandle) => void;
}

export interface CreateConnectorFormStatus {
  /** Whether an external Save button should be disabled. */
  isSubmitDisabled: boolean;
  /** Whether a create is in flight (or the form is submitting). */
  isSaving: boolean;
}

export interface CreateConnectorFormHandle {
  /** Validate the form and create the connector. Resolves to the created connector, or undefined when invalid. */
  submit: () => Promise<ActionConnector | undefined>;
}

/**
 * A standalone connector creation form for a single, pre-selected connector
 * type. Unlike {@link CreateConnectorFlyout}, it renders no flyout chrome and no
 * type picker, so it can be embedded in another container (e.g. the Agent
 * Builder attachment canvas) without nesting a flyout/focus-trap.
 *
 * The create-form core (action type model resolution, form state, validation +
 * create) is shared with the flyout via {@link useConnectorCreateForm}; this
 * component only renders that single-type form and exposes a submit handle.
 * Config and secrets go straight to the Actions API and never pass through the
 * host.
 */
const CreateConnectorFormComponent: React.FC<CreateConnectorFormProps> = ({
  actionTypeRegistry,
  actionTypeId,
  initialName,
  onStateChange,
  onReady,
}) => {
  const {
    actionTypeModel,
    isLoadingActionTypeModel,
    actionTypeModelError,
    refetchConnectorSpec,
    showLoadingSpinner,
    setFormState,
    defaultConnector,
    isSaving,
    isSubmitDisabled,
    showFormErrors,
    preSubmitValidationErrorMessage,
    validateAndCreateConnector,
  } = useConnectorCreateForm({
    actionTypeRegistry,
    actionTypeId,
    initialConnector: initialName ? { name: initialName } : undefined,
  });

  // Expose a stable handle whose submit always runs the latest logic.
  const submitRef = useRef(validateAndCreateConnector);
  useEffect(() => {
    submitRef.current = validateAndCreateConnector;
  }, [validateAndCreateConnector]);
  const handle = useMemo<CreateConnectorFormHandle>(
    () => ({ submit: () => submitRef.current() }),
    []
  );
  useEffect(() => {
    onReady?.(handle);
  }, [onReady, handle]);

  useEffect(() => {
    onStateChange?.({ isSubmitDisabled, isSaving });
  }, [onStateChange, isSubmitDisabled, isSaving]);

  const handleErrorFocus = useCallback((node: HTMLDivElement) => {
    node?.focus();
  }, []);

  return (
    <>
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
            {i18n.translate('xpack.triggersActionsUI.createConnectorForm.loadingConfiguration', {
              defaultMessage: 'Loading connector configuration...',
            })}
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
            title={i18n.translate('xpack.triggersActionsUI.createConnectorForm.specLoadError', {
              defaultMessage: 'Failed to load connector configuration',
            })}
          >
            <p>
              {i18n.translate(
                'xpack.triggersActionsUI.createConnectorForm.specLoadErrorDescription',
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
              {i18n.translate('xpack.triggersActionsUI.createConnectorForm.specLoadErrorRetry', {
                defaultMessage: 'Retry',
              })}
            </EuiButton>
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
            title={i18n.translate('xpack.triggersActionsUI.createConnectorForm.formErrorTitle', {
              defaultMessage: 'There are errors in the form',
            })}
          />
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
            />
            {!!preSubmitValidationErrorMessage && <p>{preSubmitValidationErrorMessage}</p>}
          </>
        )}
    </>
  );
};

export const CreateConnectorForm = memo(CreateConnectorFormComponent);

// eslint-disable-next-line import/no-default-export
export { CreateConnectorForm as default };
