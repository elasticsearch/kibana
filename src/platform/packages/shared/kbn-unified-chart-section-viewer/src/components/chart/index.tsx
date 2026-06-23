/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiFlexGroup, EuiFlexItem, EuiLoadingChart, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import type {
  LensLegendConfig,
  LensSeriesLayer,
  LensYBoundsConfig,
} from '@kbn/lens-embeddable-utils';
import { useBoolean } from '@kbn/react-hooks';
import React, { useRef } from 'react';
import type { EmbeddableComponentProps } from '@kbn/lens-plugin/public';
import { useLensProps } from './hooks/use_lens_props';
import type { LensWrapperProps } from './lens_wrapper';
import { LensWrapper } from './lens_wrapper';
import type { UnifiedMetricsGridProps } from '../../types';

export const ChartSizes = {
  s: 230,
  m: 350,
};

export type ChartSize = keyof typeof ChartSizes;
export type ChartProps = Pick<UnifiedMetricsGridProps, 'fetchParams'> &
  Omit<LensWrapperProps, 'lensProps' | 'abortController'> & {
    size?: ChartSize;
    discoverFetch$: UnifiedMetricsGridProps['fetch$'];
    esqlQuery: string;
    title: string;
    description?: string;
    chartLayers: LensSeriesLayer[];
    yBounds?: LensYBoundsConfig;
    legend?: LensLegendConfig;
    isLoading?: boolean;
    error?: Error;
    userMessages?: EmbeddableComponentProps['userMessages'];
    profileId: string;
    id: string;
  };

const LensWrapperMemo = React.memo(LensWrapper);
export const Chart = ({
  services,
  onBrushEnd,
  onFilter,
  onViewDetails,
  onExploreInDiscoverTab,
  fetchParams,
  discoverFetch$,
  titleHighlight,
  size = 'm',
  esqlQuery,
  title,
  description,
  chartLayers,
  syncCursor,
  syncTooltips,
  yBounds,
  legend,
  extraDisabledActions,
  quickActionIds,
  isLoading = false,
  error,
  userMessages,
  profileId,
  id,
}: ChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { euiTheme } = useEuiTheme();

  const [isSaveModalVisible, { toggle: toggleSaveModalVisible }] = useBoolean(false);
  const { SaveModalComponent } = services.lens;

  const lensProps = useLensProps({
    chartId: id,
    title,
    description,
    query: esqlQuery,
    services,
    fetchParams,
    discoverFetch$,
    chartRef,
    chartLayers,
    yBounds,
    legend,
    error,
    userMessages,
    profileId,
  });

  return (
    <div
      css={css`
        height: ${ChartSizes[size]}px;
        outline: ${euiTheme.border.width.thin} solid ${euiTheme.colors.lightShade};
        border-radius: ${euiTheme.border.radius.medium};
      `}
      ref={chartRef}
    >
      {lensProps && !isLoading ? (
        <>
          <LensWrapperMemo
            lensProps={lensProps}
            services={services}
            onBrushEnd={onBrushEnd}
            onFilter={onFilter}
            abortController={fetchParams.abortController}
            onViewDetails={onViewDetails}
            onCopyToDashboard={toggleSaveModalVisible}
            onExploreInDiscoverTab={onExploreInDiscoverTab}
            syncCursor={syncCursor}
            titleHighlight={titleHighlight}
            syncTooltips={syncTooltips}
            extraDisabledActions={extraDisabledActions}
            quickActionIds={quickActionIds}
          />
          {isSaveModalVisible && (
            <SaveModalComponent
              initialInput={{ attributes: lensProps.attributes }}
              onClose={toggleSaveModalVisible}
              // Disables saving ESQL charts to the library.
              // it will only copy it to a dashboard
              isSaveable={false}
            />
          )}
        </>
      ) : (
        <EuiFlexGroup
          style={{ height: '100%' }}
          justifyContent="center"
          alignItems="center"
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <EuiLoadingChart size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
    </div>
  );
};
