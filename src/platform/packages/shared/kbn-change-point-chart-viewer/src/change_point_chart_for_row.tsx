/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import { EuiEmptyPrompt } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ChangePointLensChart } from './components/change_point_lens_chart';
import { ChangePointDetailsSection } from './components/change_point_details_section';
import { getCardForRow } from './utils/derive_change_point_cards';
import { useChangePointCards } from './hooks/use_change_point_cards';
import type { UnifiedChangePointGridProps } from './types';

export interface ChangePointChartForRowProps
  extends Pick<
    UnifiedChangePointGridProps,
    'services' | 'fetchParams' | 'fetch$' | 'onBrushEnd' | 'onFilter' | 'actions'
  > {
  row: Readonly<Record<string, unknown>>;
}

/**
 * Renders the change point mini chart and details for a single result row.
 * Shows an informational message when the row has no detected change point.
 */
export const ChangePointChartForRow: React.FC<ChangePointChartForRowProps> = ({
  fetchParams,
  fetch$,
  services,
  onBrushEnd,
  onFilter,
  actions,
  row,
}) => {
  const { cards, seriesColumns } = useChangePointCards(fetchParams);
  const card = useMemo(() => (cards ? getCardForRow(cards, row) : undefined), [cards, row]);

  if (!card || !seriesColumns) {
    return (
      <EuiEmptyPrompt
        iconType="visLine"
        title={
          <h3>
            {i18n.translate('changePointChartViewer.flyout.noChartTitle', {
              defaultMessage: 'No change point detected',
            })}
          </h3>
        }
        body={
          <p>
            {i18n.translate('changePointChartViewer.flyout.noChartBody', {
              defaultMessage: 'This row does not have a detected change point.',
            })}
          </p>
        }
      />
    );
  }

  return (
    <>
      <ChangePointLensChart
        card={card}
        cardIndex={0}
        valueColumn={seriesColumns.valueColumn}
        timeColumn={seriesColumns.timeColumn}
        services={services}
        fetchParams={fetchParams}
        fetch$={fetch$}
        onBrushEnd={onBrushEnd}
        onFilter={onFilter}
        actions={actions}
      />
      <ChangePointDetailsSection
        card={card}
        row={row}
        seriesColumns={seriesColumns}
        fieldFormats={services.fieldFormats}
      />
    </>
  );
};
