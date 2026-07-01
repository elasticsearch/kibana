/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingChart, EuiPanel, EuiTitle } from '@elastic/eui';
import type { LensAttributes, LensConfig, LensESQLDataset } from '@kbn/lens-embeddable-utils';
import { LensConfigBuilder } from '@kbn/lens-embeddable-utils';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import useAsync from 'react-use/lib/useAsync';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';

const CHART_HEIGHT = 200;

interface ServiceFlyoutLensChartProps {
  id: string;
  title: string;
  titleAction?: React.ReactNode;
  config?: LensConfig;
  rangeFrom: string;
  rangeTo: string;
  refreshToken: number;
}

function ServiceFlyoutLensChartComponent({
  id,
  title,
  titleAction,
  config,
  rangeFrom,
  rangeTo,
  refreshToken,
}: ServiceFlyoutLensChartProps) {
  const { lens, dataViews } = useApmPluginContext();
  const timeRange = useMemo(() => ({ from: rangeFrom, to: rangeTo }), [rangeFrom, rangeTo]);

  const { value: builtAttributes } = useAsync(async () => {
    if (!config) {
      return undefined;
    }
    const builder = new LensConfigBuilder(dataViews);
    return builder.build(config, {
      query: { esql: (config.dataset as LensESQLDataset).esql },
    }) as Promise<LensAttributes>;
  }, [config, dataViews]);

  const lastAttributes = useRef<LensAttributes | undefined>(undefined);

  useEffect(() => {
    if (builtAttributes) lastAttributes.current = builtAttributes;
  }, [builtAttributes]);

  const attributes = builtAttributes ?? lastAttributes.current;

  const LensEmbeddableComponent = lens.EmbeddableComponent;

  return (
    <EuiPanel
      hasBorder
      hasShadow={false}
      paddingSize="none"
      data-test-subj={`serviceFlyoutLensChart-${id}`}
      css={css`
        min-height: ${CHART_HEIGHT}px;
      `}
    >
      <EuiFlexGroup
        gutterSize="s"
        alignItems="center"
        justifyContent="spaceBetween"
        css={css`
          padding: 8px 12px 0;
        `}
      >
        <EuiFlexItem>
          <EuiTitle size="xxs">
            <h4>{title}</h4>
          </EuiTitle>
        </EuiFlexItem>
        {titleAction ? <EuiFlexItem grow={false}>{titleAction}</EuiFlexItem> : null}
      </EuiFlexGroup>
      <div
        css={css`
          height: ${CHART_HEIGHT}px;
        `}
      >
        {attributes ? (
          <LensEmbeddableComponent
            id={`service-flyout-${id}`}
            attributes={attributes}
            timeRange={timeRange}
            hidePanelTitles
            noPadding
            withDefaultActions={false}
            lastReloadRequestTime={refreshToken}
            viewMode="view"
            style={{ height: CHART_HEIGHT }}
            executionContext={{
              description: 'apm service flyout chart data',
              meta: { profile_id: 'service-flyout', metric_id: id },
            }}
          />
        ) : (
          <EuiFlexGroup
            style={{ height: '100%' }}
            justifyContent="center"
            alignItems="center"
            responsive={false}
            data-test-subj={`serviceFlyoutLensChartLoading-${id}`}
          >
            <EuiFlexItem grow={false}>
              <EuiLoadingChart size="l" />
            </EuiFlexItem>
          </EuiFlexGroup>
        )}
      </div>
    </EuiPanel>
  );
}

export const ServiceFlyoutLensChart: React.FC<ServiceFlyoutLensChartProps> = memo(
  ServiceFlyoutLensChartComponent
);
