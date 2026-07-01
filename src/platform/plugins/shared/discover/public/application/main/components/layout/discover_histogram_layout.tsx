/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import { UnifiedHistogramLayout } from '@kbn/unified-histogram';
import { OutPortal } from 'react-reverse-portal';
import { PanelsToggle } from '../../../../components/panels_toggle';
import { type DiscoverMainContentProps, DiscoverMainContent } from './discover_main_content';
import {
  DEFAULT_HISTOGRAM_KEY_PREFIX,
  useCurrentChartPortalNode,
  useCurrentTabRuntimeState,
  useAppStateSelector,
} from '../../state_management/redux';

export const DiscoverHistogramLayout = (mainContentProps: DiscoverMainContentProps) => {
  const chartPortalNode = useCurrentChartPortalNode();
  const { localStorageKeyPrefix, layoutPropsMap } = useCurrentTabRuntimeState(
    (tab) => tab.unifiedHistogramConfig$
  );
  const layoutProps = layoutPropsMap[localStorageKeyPrefix ?? DEFAULT_HISTOGRAM_KEY_PREFIX];
  const isMainPanelHidden = useAppStateSelector((state) => Boolean(state.hideTable));
  const panelsToggle = useMemo(() => <PanelsToggle dataTestSubjSuffix="InHistogram" />, []);

  if (!layoutProps) {
    return null;
  }

  return (
    <UnifiedHistogramLayout
      unifiedHistogramChart={
        chartPortalNode ? <OutPortal node={chartPortalNode} panelsToggle={panelsToggle} /> : null
      }
      isMainPanelHidden={isMainPanelHidden}
      {...layoutProps}
    >
      <DiscoverMainContent {...mainContentProps} />
    </UnifiedHistogramLayout>
  );
};
