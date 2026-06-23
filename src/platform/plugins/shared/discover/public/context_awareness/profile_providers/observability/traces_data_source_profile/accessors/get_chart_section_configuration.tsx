/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { TraceMetricsGrid } from '@kbn/unified-chart-section-viewer';
import React, { useCallback } from 'react';
import type { ChartSectionProps } from '@kbn/unified-histogram/types';
import type { DataSourceProfileProvider } from '../../../../profiles';
import type { ContextAwarenessToolkitActions } from '../../../../toolkit';
import {
  internalStateActions,
  useAppStateSelector,
  useCurrentTabAction,
  useInternalStateDispatch,
} from '../../../../../application/main/state_management/redux';
import type { DiscoverAppState } from '../../../../../application/main/state_management/redux';
import { OBSERVABILITY_TRACES_DATA_SOURCE_PROFILE_ID } from '../profile';

const TraceMetricsGridWrapper = (
  props: ChartSectionProps & { actions: ContextAwarenessToolkitActions }
) => {
  const breakdownField = useAppStateSelector((state: DiscoverAppState) => state.breakdownField);
  const dispatch = useInternalStateDispatch();
  const updateAppState = useCurrentTabAction(internalStateActions.updateAppState);

  const onBreakdownFieldChange = useCallback(
    (nextBreakdownField?: string) => {
      dispatch(updateAppState({ appState: { breakdownField: nextBreakdownField } }));
    },
    [dispatch, updateAppState]
  );

  return (
    <TraceMetricsGrid
      profileId={OBSERVABILITY_TRACES_DATA_SOURCE_PROFILE_ID}
      {...props}
      actions={props.actions}
      breakdownField={breakdownField}
      onBreakdownFieldChange={onBreakdownFieldChange}
    />
  );
};

export const getChartSectionConfiguration =
  (): DataSourceProfileProvider['profile']['getChartSectionConfiguration'] =>
  (prev, { toolkit }) =>
  () => {
    return {
      ...prev(),
      renderChartSection: (props) => {
        return <TraceMetricsGridWrapper {...props} actions={toolkit.actions} />;
      },
      replaceDefaultChart: true,
      defaultTopPanelHeight: 300,
    };
  };
