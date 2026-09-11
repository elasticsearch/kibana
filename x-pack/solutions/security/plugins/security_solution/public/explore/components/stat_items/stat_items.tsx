/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiHorizontalRule, EuiPanel } from '@elastic/eui';
import React, { useMemo } from 'react';
import { StatItemHeader } from './stat_item_header';
import { useToggleStatus } from './use_toggle_status';
import type { StatItemsProps } from './types';
import { ChartHeight, FlexItem } from './utils';
import { MetricEmbeddable } from './metric_embeddable';
import { VisualizationEmbeddable } from '../../../common/components/visualization_actions/visualization_embeddable';
import { useSpaceId } from '../../../common/hooks/use_space_id';
import { PageScope } from '../../../data_view_manager/constants';
import { useExploreEntityStoreV2Enabled } from '../../hooks/use_explore_entity_store_v2_enabled';

export const StatItemsComponent = React.memo<StatItemsProps>(({ statItems, from, id, to }) => {
  const timerange = useMemo(
    () => ({
      from,
      to,
    }),
    [from, to]
  );
  const {
    key,
    description,
    enableAreaChart,
    enableBarChart,
    fields,
    getBarChartLensAttributes,
    getAreaChartLensAttributes,
  } = statItems;

  const { isToggleExpanded, onToggle } = useToggleStatus({ id });
  const spaceId = useSpaceId();
  const entityStoreV2Enabled = useExploreEntityStoreV2Enabled();

  const kpiLensExtraOptions = useMemo(
    () => (entityStoreV2Enabled ? { entityStoreV2Enabled: true, spaceId } : undefined),
    [entityStoreV2Enabled, spaceId]
  );

  return (
    <FlexItem grow={1} data-test-subj={key}>
      <EuiPanel hasBorder>
        <StatItemHeader
          onToggle={onToggle}
          isToggleExpanded={isToggleExpanded}
          description={description}
        />

        {isToggleExpanded && (
          <>
            <MetricEmbeddable
              extraOptions={kpiLensExtraOptions}
              fields={fields}
              id={id}
              timerange={timerange}
              inspectTitle={description}
            />

            {(enableAreaChart || enableBarChart) && <EuiHorizontalRule />}
            <EuiFlexGroup gutterSize="none">
              {enableBarChart && (
                <FlexItem>
                  <VisualizationEmbeddable
                    data-test-subj="embeddable-bar-chart"
                    getLensAttributes={getBarChartLensAttributes}
                    timerange={timerange}
                    id={`${id}-bar-embeddable`}
                    height={ChartHeight}
                    inspectTitle={description}
                    scopeId={PageScope.explore}
                  />
                </FlexItem>
              )}

              {enableAreaChart && from != null && to != null && (
                <>
                  <FlexItem>
                    <VisualizationEmbeddable
                      data-test-subj="embeddable-area-chart"
                      extraOptions={kpiLensExtraOptions}
                      getLensAttributes={getAreaChartLensAttributes}
                      timerange={timerange}
                      id={`${id}-area-embeddable`}
                      height={ChartHeight}
                      inspectTitle={description}
                      scopeId={PageScope.explore}
                    />
                  </FlexItem>
                </>
              )}
            </EuiFlexGroup>
          </>
        )}
      </EuiPanel>
    </FlexItem>
  );
});

StatItemsComponent.displayName = 'StatItemsComponent';
