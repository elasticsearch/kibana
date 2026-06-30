/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import useObservable from 'react-use/lib/useObservable';
import { EuiEmptyPrompt, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import { ChangePointChartForRow } from '@kbn/change-point-chart-viewer';
import type { ChangePointChartSectionActions } from '@kbn/change-point-chart-viewer';
import type { ChangePointChartSectionProps$ } from './change_point_context';

interface ChangePointDocViewerPanelProps {
  record: DataTableRecord;
  context: { chartSectionProps$: ChangePointChartSectionProps$ };
  actions: ChangePointChartSectionActions;
}

/**
 * Doc viewer tab rendered inside the Discover row flyout when the change point
 * data source profile is active. Subscribes to the profile-scoped chart section
 * props and delegates rendering to {@link ChangePointChartForRow}.
 */
export const ChangePointDocViewerPanel: React.FC<ChangePointDocViewerPanelProps> = ({
  record,
  context,
  actions,
}) => {
  const chartSectionProps = useObservable(
    context.chartSectionProps$,
    context.chartSectionProps$.getValue()
  );

  if (!chartSectionProps) {
    return (
      <EuiEmptyPrompt
        iconType="visLine"
        title={
          <h3>
            {i18n.translate('discover.contextAwareness.changePointDocViewer.noChartTitle', {
              defaultMessage: 'Chart not available',
            })}
          </h3>
        }
        body={
          <p>
            {i18n.translate('discover.contextAwareness.changePointDocViewer.noChartBody', {
              defaultMessage: 'The change point chart is not available until a query is run.',
            })}
          </p>
        }
      />
    );
  }

  return (
    <>
      <EuiSpacer size="m" />
      <ChangePointChartForRow {...chartSectionProps} actions={actions} row={record.flattened} />
    </>
  );
};
