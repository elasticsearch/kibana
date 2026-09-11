/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux-v7';

import type { AlertWorkflowStatus } from '../../../../common/types';
import { useBulkActionItems } from '../../../../common/components/toolbar/bulk_actions/use_bulk_action_items';
import { getScopedActions } from '../../../../helpers';
import type { Status } from '../../../../../common/api/detection_engine';
import { useAlertsPrivileges } from '../../../containers/detection_engine/alerts/use_alerts_privileges';
import type { SetEventsDeletedProps, SetEventsLoadingProps } from '../types';
interface Props {
  alertStatus?: Status;
  closePopover: () => void;
  eventId: string;
  scopeId: string;
  refetch?: () => void;
}

export const useAlertsActions = ({
  alertStatus,
  closePopover,
  eventId,
  scopeId,
  refetch,
}: Props) => {
  const dispatch = useDispatch();
  const { hasAlertsUpdate } = useAlertsPrivileges();

  const onStatusUpdate = useCallback(() => {
    closePopover();
    if (refetch) {
      refetch();
    }
  }, [closePopover, refetch]);

  const scopedActions = getScopedActions(scopeId);
  const localSetEventsLoading = useCallback(
    ({ eventIds, isLoading }: SetEventsLoadingProps) => {
      if (scopedActions) {
        dispatch(scopedActions.setEventsLoading({ id: scopeId, eventIds, isLoading }));
      }
    },
    [dispatch, scopeId, scopedActions]
  );

  const setEventsDeleted = useCallback(
    ({ eventIds, isDeleted }: SetEventsDeletedProps) => {
      if (scopedActions) {
        dispatch(scopedActions.setEventsDeleted({ id: scopeId, eventIds, isDeleted }));
      }
    },
    [dispatch, scopeId, scopedActions]
  );

  const eventIds = useMemo(() => [eventId], [eventId]);

  const actionItemArgs = useMemo(() => {
    return {
      eventIds,
      currentStatus: alertStatus as AlertWorkflowStatus,
      setEventsLoading: localSetEventsLoading,
      setEventsDeleted,
      onUpdateSuccess: onStatusUpdate,
      onUpdateFailure: onStatusUpdate,
      closePopover,
      showRunWorkflowActions: false,
    };
  }, [
    alertStatus,
    closePopover,
    eventIds,
    localSetEventsLoading,
    onStatusUpdate,
    setEventsDeleted,
  ]);

  const {
    groups: { statusItems: actionItems },
    panels,
  } = useBulkActionItems(actionItemArgs);

  return useMemo(() => {
    return hasAlertsUpdate ? { actionItems, panels } : { actionItems: [], panels: [] };
  }, [actionItems, hasAlertsUpdate, panels]);
};
