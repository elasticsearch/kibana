/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { useKibana } from '../../../../common/lib/kibana';
import { getExploreButtonInfo } from '../utils/get_explore_url';

export const EXPLORE_ACTION_ID = 'explore-action';

export interface UseExploreActionsParams {
  /**
   * The raw document record, used to extract alert metadata
   */
  hit: DataTableRecord;
  /**
   * Callback to close the popover when the item is clicked
   */
  closePopover: () => void;
}

export interface UseExploreActionsResult {
  /**
   * Items to display in the popover dropdown
   */
  exploreActionItems: {
    'data-test-subj': string;
    key: string;
    name: string;
    onClick: () => void;
  }[];
}

export const useExploreActions = ({
  hit,
  closePopover,
}: UseExploreActionsParams): UseExploreActionsResult => {
  const { services } = useKibana();

  const { url, label } = useMemo(() => {
    const timelinesURL = services.application.getUrlForApp('securitySolutionUI', {
      path: 'alerts',
    });
    return getExploreButtonInfo(hit, timelinesURL);
  }, [hit, services.application]);

  const onClick = useCallback(() => {
    closePopover();
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [closePopover, url]);

  const exploreActionItems = useMemo(
    () => [
      {
        'data-test-subj': 'explore-in-alerts-or-timeline',
        key: EXPLORE_ACTION_ID,
        name: label,
        onClick,
      },
    ],
    [label, onClick]
  );

  return { exploreActionItems };
};
