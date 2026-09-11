/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect } from 'react';
import { EuiFlexItem, EuiFlexGroup, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ReactElement } from 'react';
import { isLeft } from 'fp-ts/Either';
import { createKeyInsightsPanelLensAttributes } from './lens_attributes';
import { VisualizationEmbeddable } from '../../../../../../common/components/visualization_actions/visualization_embeddable';
import { useEsqlGlobalFilterQuery } from '../../../../../../common/hooks/esql/use_esql_global_filter';
import { useGlobalTime } from '../../../../../../common/containers/use_global_time';
import { useSpaceId } from '../../../../../../common/hooks/use_space_id';
import { useVisualizationResponse } from '../../../../../../common/components/visualization_actions/use_visualization_response';
import { VisualizationContextMenuActions } from '../../../../../../common/components/visualization_actions/types';
import type { EsqlQueryOrInvalidFields } from '../../../queries/helpers';

const LENS_VISUALIZATION_HEIGHT = 140;

interface KeyInsightsTileProps {
  title: string;
  label: string;
  getEsqlQuery: (namespace: string) => EsqlQueryOrInvalidFields;
  id: string;
  inspectTitle: ReactElement;
  spaceId?: string;
}

export const KeyInsightsTile: React.FC<KeyInsightsTileProps> = ({
  title,
  label,
  getEsqlQuery,
  id,
  inspectTitle,
  spaceId: propSpaceId,
}) => {
  const filterQuery = useEsqlGlobalFilterQuery();
  const timerange = useGlobalTime();
  const hookSpaceId = useSpaceId();

  // Use prop spaceId if provided, otherwise use hook spaceId, fallback to 'default'
  const effectiveSpaceId = propSpaceId || hookSpaceId || 'default';

  const visualizationResponse = useVisualizationResponse({
    visualizationId: id,
  });

  // Track whether loading has started at least once
  const [hasStartedLoading, setHasStartedLoading] = useState(false);

  useEffect(() => {
    if (visualizationResponse?.loading === true) {
      setHasStartedLoading(true);
    }
  }, [visualizationResponse?.loading]);

  // Reset hasStartedLoading when any filter changes to allow fresh error detection
  useEffect(() => {
    setHasStartedLoading(false);
  }, [timerange.from, timerange.to, filterQuery, effectiveSpaceId]);

  const esqlQuery = getEsqlQuery(effectiveSpaceId);

  // Only show error state if:
  // 1. Loading has started at least once (hasStartedLoading)
  // 2. Loading is now complete (loading === false)
  // 3. We have no tables (indicating an error)
  if (
    isLeft(esqlQuery) ||
    (hasStartedLoading &&
      visualizationResponse &&
      visualizationResponse.loading === false &&
      !visualizationResponse.tables)
  ) {
    return (
      <EuiFlexGroup
        direction="column"
        justifyContent="spaceBetween"
        style={{ height: '100%' }} // ensures it uses the full height so 'space-between' works
      >
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h4>{title}</h4>
          </EuiTitle>
        </EuiFlexItem>

        <EuiFlexItem grow={false} style={{ alignSelf: 'flex-end' }}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle>
                <h3>
                  {i18n.translate(
                    'xpack.securitySolution.privilegedUserMonitoring.keyInsights.NA',
                    {
                      defaultMessage: 'N/A',
                    }
                  )}
                </h3>
              </EuiTitle>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  const lensAttributes = createKeyInsightsPanelLensAttributes({
    title,
    label,
    esqlQuery: esqlQuery.right,
    dataViewId: 'default-dataview',
    filterQuery,
  });

  // If we reach here, either still loading or we have a valid response, so show the embeddable
  return (
    <VisualizationEmbeddable
      applyGlobalQueriesAndFilters={true}
      applyPageAndTabsFilters={true}
      lensAttributes={lensAttributes}
      id={id}
      timerange={timerange}
      width={'100%'}
      height={LENS_VISUALIZATION_HEIGHT}
      disableOnClickFilter
      inspectTitle={inspectTitle}
      withActions={[
        VisualizationContextMenuActions.inspect,
        VisualizationContextMenuActions.addToCase,
        VisualizationContextMenuActions.saveToLibrary,
        // Excluding VisualizationContextMenuActions.openInLens
      ]}
    />
  );
};
