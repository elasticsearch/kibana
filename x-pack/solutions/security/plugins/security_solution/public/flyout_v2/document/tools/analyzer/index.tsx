/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { css } from '@emotion/react';
import { EuiFlyoutBody, EuiFlyoutHeader, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { CellActionRenderer } from '../../../shared/components/cell_actions';
import { DocumentToolsFlyoutHeader } from '../../../shared/components/document_tools_flyout_header';
import { PREFIX } from '../../../../flyout/shared/test_ids';
import { PageScope } from '../../../../data_view_manager/constants';
import { useSelectedPatterns } from '../../../../data_view_manager/hooks/use_selected_patterns';
import { useTimelineDataFilters } from '../../../../timelines/containers/use_timeline_data_filters';
import { Resolver } from '../../../../resolver/view';

export const ANALYZER_GRAPH_TEST_ID = `${PREFIX}AnalyzerGraph` as const;

export interface AnalyzerGraphProps {
  /**
   * The document record that will be used to render the content of the analyzer graph.
   */
  hit: DataTableRecord;
  /**
   * A function that renders cell actions for the analyzer graph.
   */
  renderCellActions: CellActionRenderer;
  /**
   * Callback invoked after alert mutations to refresh parent flyout content.
   */
  onAlertUpdated: () => void;
}

const RESOLVER_COMPONENT_INSTANCE_ID = 'flyout_v2_analyzer_graph';

const TITLE = i18n.translate('xpack.securitySolution.flyout.analyzer.title', {
  defaultMessage: 'Analyzer',
});

/**
 * Analyzer graph view displayed in the analyzer tools flyout
 */
export const AnalyzerGraph = memo(
  ({ hit, renderCellActions, onAlertUpdated }: AnalyzerGraphProps) => {
    const { euiTheme } = useEuiTheme();
    const eventId = hit.raw._id ?? '';

    const { from, to, shouldUpdate } = useTimelineDataFilters(false);
    const filters = useMemo(() => ({ from, to }), [from, to]);

    const selectedPatterns = useSelectedPatterns(PageScope.analyzer);

    if (!eventId) {
      return null;
    }

    return (
      <>
        <EuiFlyoutHeader
          hasBorder
          css={css`
            padding-block: ${euiTheme.size.s} !important;
          `}
        >
          <DocumentToolsFlyoutHeader
            title={TITLE}
            hit={hit}
            renderCellActions={renderCellActions}
            onAlertUpdated={onAlertUpdated}
          />
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <div data-test-subj={ANALYZER_GRAPH_TEST_ID}>
            <Resolver
              databaseDocumentID={eventId}
              resolverComponentInstanceID={RESOLVER_COMPONENT_INSTANCE_ID}
              indices={selectedPatterns}
              shouldUpdate={shouldUpdate}
              filters={filters}
              renderCellActions={renderCellActions}
              onAlertUpdated={onAlertUpdated}
            />
          </div>
        </EuiFlyoutBody>
      </>
    );
  }
);

AnalyzerGraph.displayName = 'AnalyzerGraph';
