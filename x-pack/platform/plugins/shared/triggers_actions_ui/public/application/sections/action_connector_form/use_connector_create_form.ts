/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useDebounce from 'react-use/lib/useDebounce';
import type { ConnectorFormSchema } from '@kbn/alerts-ui-shared';
import { useActionTypeModel } from '@kbn/alerts-ui-shared/src/common/hooks/use_action_type_model';
import type { ActionConnector, ActionTypeRegistryContract } from '../../../types';
import { hasSaveActionsCapability } from '../../lib/capabilities';
import { useKibana } from '../../../common/lib/kibana';
import { useCreateConnector } from '../../hooks/use_create_connector';
import type { ConnectorFormState } from './connector_form';

export interface UseConnectorCreateFormParams {
  actionTypeRegistry: ActionTypeRegistryContract;
  /**
   * The connector type to create. `undefined` while no type is selected yet
   * (e.g. the flyout before the user picks a type).
   */
  actionTypeId: string | undefined;
  /** Optional initial values merged onto the empty connector (name, config, …). */
  initialConnector?: Partial<Omit<ActionConnector, 'secrets'>>;
}

/**
 * Shared core for creating a connector: resolves the action type model (stack
 * or spec-based), holds the `ConnectorForm` state, exposes a
 * `validateAndCreateConnector` that validates → runs the pre-submit validator →
 * POSTs via `useCreateConnector`, and surfaces the derived flags/error states a
 * host needs to drive its own Save button and callouts.
 */
export const useConnectorCreateForm = ({
  actionTypeRegistry,
  actionTypeId,
  initialConnector,
}: UseConnectorCreateFormParams) => {
  const {
    application: { capabilities },
    http,
    uiSettings,
  } = useKibana().services;
  const {
    isLoading: isSavingConnector,
    createConnector,
    createConnectorError,
  } = useCreateConnector();

  const isMounted = useRef(false);
  const canSave = hasSaveActionsCapability(capabilities);
  const [showFormErrors, setShowFormErrors] = useState<boolean>(false);
  const [preSubmitValidationErrorMessage, setPreSubmitValidationErrorMessage] =
    useState<ReactNode>(null);
  const [formState, setFormState] = useState<ConnectorFormState>({
    isSubmitted: false,
    isSubmitting: false,
    isValid: undefined,
    submit: async () => ({ isValid: false, data: {} as ConnectorFormSchema }),
    preSubmitValidator: null,
  });
  const { preSubmitValidator, submit, isValid: isFormValid, isSubmitting } = formState;

  const {
    actionTypeModel,
    isLoading: isLoadingActionTypeModel,
    error: actionTypeModelError,
    refetch: refetchConnectorSpec,
  } = useActionTypeModel({ actionTypeRegistry, actionTypeId, http, uiSettings });

  // Delay the spinner so quick spec loads don't flash a loading state.
  const [showLoadingSpinner, setShowLoadingSpinner] = useState(false);
  useDebounce(() => setShowLoadingSpinner(isLoadingActionTypeModel), 300, [
    isLoadingActionTypeModel,
  ]);

  const defaultConnector = useMemo(() => {
    const empty = {
      actionTypeId: actionTypeId ?? '',
      isDeprecated: false,
      config: {},
      secrets: {},
      isMissingSecrets: false,
      isConnectorTypeDeprecated: false,
    };
    return initialConnector ? { ...empty, ...initialConnector } : empty;
  }, [actionTypeId, initialConnector]);

  const hasErrors = isFormValid === false;
  const isSaving = isSavingConnector || isSubmitting;
  const isSubmitDisabled =
    hasErrors || !canSave || isLoadingActionTypeModel || !!actionTypeModelError || !actionTypeModel;

  const validateAndCreateConnector = useCallback(async (): Promise<ActionConnector | undefined> => {
    setPreSubmitValidationErrorMessage(null);
    setShowFormErrors(false);

    const { isValid, data } = await submit();
    if (!isMounted.current) {
      return undefined;
    }

    if (isValid) {
      if (preSubmitValidator) {
        const validatorRes = await preSubmitValidator();
        if (validatorRes) {
          setPreSubmitValidationErrorMessage(validatorRes.message);
          return undefined;
        }
      }

      const { actionTypeId: typeId, name, config, secrets, id } = data;
      return createConnector({
        actionTypeId: typeId,
        name: name ?? '',
        config: config ?? {},
        secrets: secrets ?? {},
        id: id ?? '',
      });
    }

    setShowFormErrors(true);
    return undefined;
  }, [submit, preSubmitValidator, createConnector]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    // action type model
    actionTypeModel,
    isLoadingActionTypeModel,
    actionTypeModelError,
    refetchConnectorSpec,
    showLoadingSpinner,
    // connector form wiring
    formState,
    setFormState,
    defaultConnector,
    // derived flags
    canSave,
    isSaving,
    hasErrors,
    isSubmitDisabled,
    // error states
    showFormErrors,
    setShowFormErrors,
    preSubmitValidationErrorMessage,
    createConnectorError,
    // action
    validateAndCreateConnector,
  };
};
