/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import type { TimelineEventsDetailsItem } from '@kbn/timelines-plugin/common';
import { FormattedMessage } from '@kbn/i18n-react';
import { useUserPrivileges } from '../../../user_privileges';
import type { AlertTableContextMenuItem } from '../../../../../detections/components/alerts_table/types';
import { useWithResponderActionDataFromAlert } from './use_responder_action_data';

export const RESPOND_ACTION_ID = 'endpointResponseActions-action-item';

export const useResponderActionItem = (
  eventDetailsData: TimelineEventsDetailsItem[] | null,
  onClick: () => void
): AlertTableContextMenuItem[] => {
  const { loading: isAuthzLoading, canAccessResponseConsole } =
    useUserPrivileges().endpointPrivileges;
  const { handleResponseActionsClick, isDisabled, tooltip } = useWithResponderActionDataFromAlert({
    onClick,
    eventData: eventDetailsData,
  });

  return useMemo(() => {
    const actions: AlertTableContextMenuItem[] = [];

    if (!isAuthzLoading && canAccessResponseConsole) {
      actions.push({
        key: RESPOND_ACTION_ID,
        'data-test-subj': 'endpointResponseActions-action-item',
        disabled: isDisabled,
        toolTipContent: tooltip,
        onClick: handleResponseActionsClick,
        name: (
          <FormattedMessage
            id="xpack.securitySolution.endpoint.detections.takeAction.responseActionConsole.buttonLabel"
            defaultMessage="Respond"
          />
        ),
      });
    }

    return actions;
  }, [canAccessResponseConsole, handleResponseActionsClick, isAuthzLoading, isDisabled, tooltip]);
};
