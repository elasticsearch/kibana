/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';

import { useEndpointExceptionsCapability } from '../../../../exceptions/hooks/use_endpoint_exceptions_capability';
import { ACTION_ADD_ENDPOINT_EXCEPTION, ACTION_ADD_EXCEPTION } from '../translations';
import type { AlertTableContextMenuItem } from '../types';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useAlertsPrivileges } from '../../../containers/detection_engine/alerts/use_alerts_privileges';

export const ALERT_EXCEPTION_ACTION_IDS = {
  addEndpointException: 'add-endpoint-exception-menu-item',
  addRuleException: 'add-exception-menu-item',
} as const;

export interface UseExceptionActionProps {
  isEndpointAlert: boolean;
  onAddExceptionTypeClick: (type?: ExceptionListTypeEnum) => void;
}

export const useAlertExceptionActions = ({
  isEndpointAlert,
  onAddExceptionTypeClick,
}: UseExceptionActionProps) => {
  const canEditExceptions = useUserPrivileges().rulesPrivileges.exceptions.edit;
  const { hasIndexWrite } = useAlertsPrivileges();
  const canWriteEndpointExceptions = useEndpointExceptionsCapability('crudEndpointExceptions');

  const handleDetectionExceptionModal = useCallback(() => {
    onAddExceptionTypeClick();
  }, [onAddExceptionTypeClick]);

  const handleEndpointExceptionModal = useCallback(() => {
    onAddExceptionTypeClick(ExceptionListTypeEnum.ENDPOINT);
  }, [onAddExceptionTypeClick]);

  const disabledAddEndpointException = !canWriteEndpointExceptions || !isEndpointAlert;
  const disabledAddException = !canEditExceptions || !hasIndexWrite;

  const exceptionActionItems: AlertTableContextMenuItem[] = useMemo(
    () =>
      disabledAddException && disabledAddEndpointException
        ? []
        : [
            {
              key: ALERT_EXCEPTION_ACTION_IDS.addEndpointException,
              'data-test-subj': 'add-endpoint-exception-menu-item',
              disabled: disabledAddEndpointException,
              onClick: handleEndpointExceptionModal,
              name: ACTION_ADD_ENDPOINT_EXCEPTION,
            },
            {
              key: ALERT_EXCEPTION_ACTION_IDS.addRuleException,
              'data-test-subj': 'add-exception-menu-item',
              disabled: disabledAddException,
              onClick: handleDetectionExceptionModal,
              name: ACTION_ADD_EXCEPTION,
            },
          ],
    [
      disabledAddEndpointException,
      disabledAddException,
      handleDetectionExceptionModal,
      handleEndpointExceptionModal,
    ]
  );

  return { exceptionActionItems };
};
