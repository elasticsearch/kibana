/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { ACTION_ADD_EVENT_FILTER } from '../translations';
import type { AlertTableContextMenuItem } from '../types';

export const EVENT_FILTER_ACTION_ID = 'add-event-filter-menu-item';

export const useEventFilterAction = ({
  onAddEventFilterClick,
  disabled = false,
  tooltipMessage,
}: {
  onAddEventFilterClick: () => void;
  disabled?: boolean;
  tooltipMessage?: string;
}) => {
  const eventFilterActionItems = useMemo(
    (): AlertTableContextMenuItem[] => [
      {
        key: EVENT_FILTER_ACTION_ID,
        'data-test-subj': 'add-event-filter-menu-item',
        onClick: onAddEventFilterClick,
        disabled,
        toolTipContent: tooltipMessage,
        name: ACTION_ADD_EVENT_FILTER,
      },
    ],
    [onAddEventFilterClick, disabled, tooltipMessage]
  );
  return { eventFilterActionItems };
};
