/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TooltipInfo } from '@elastic/charts';
import {
  TooltipContainer,
  TooltipDivider,
  TooltipHeader,
  TooltipTable,
  TooltipTableBody,
  TooltipTableCell,
  TooltipTableColorCell,
  TooltipTableRow,
} from '@elastic/charts';
import React from 'react';
import { getEnvironmentLabel } from '../../../../../common/environment_filter_values';

// Matches the color column width Elastic Charts uses for its default tooltip so
// the gap between the color strip and the label stays tight. Leaving it `auto`
// lets the cell grow to its full width and pushes the label too far right.
const COLOR_COLUMN_WIDTH = '11px';

/**
 * Custom tooltip used by the RED metrics charts when anomalies from multiple
 * environments are combined into a single timeseries (the "all environments"
 * view). It uses Elastic Charts' public custom tooltip primitives so it looks
 * identical to the standard tooltip, and additionally appends the environment
 * each anomaly belongs to next to its label, e.g.
 * `Major anomaly (production)  150 ms`.
 */
export function AnomalyChartTooltip({
  values,
  header,
  headerFormatter,
}: TooltipInfo & {
  headerFormatter: (value: number) => React.ReactNode;
}) {
  const visibleValues = values.filter((value) => value.isVisible);

  if (visibleValues.length === 0) {
    return null;
  }

  return (
    <TooltipContainer>
      {header != null && (
        <>
          <TooltipHeader>{headerFormatter(header.value)}</TooltipHeader>
          <TooltipDivider />
        </>
      )}
      <TooltipTable gridTemplateColumns={`${COLOR_COLUMN_WIDTH} auto auto`}>
        <TooltipTableBody>
          {visibleValues.map((value, index) => {
            const { color, label, formattedValue, seriesIdentifier, datum } = value;
            const environment = (datum as { environment?: string } | undefined)?.environment;
            const environmentSuffix =
              environment != null ? ` (${getEnvironmentLabel(environment)})` : '';
            const fullLabel = `${label}${environmentSuffix}`;

            // In the combined "all environments" view several anomalies (from
            // different environments) can share the same x bucket within the same
            // severity series, so `seriesIdentifier.key` is not unique across rows.
            // Including the environment and index keeps React keys unique and
            // avoids reconciliation glitches that duplicated rows on hover.
            const rowKey = `${seriesIdentifier.key}-${environment ?? ''}-${index}`;

            return (
              <TooltipTableRow key={rowKey}>
                <TooltipTableColorCell color={color} />
                <TooltipTableCell truncate title={fullLabel}>
                  {fullLabel}
                </TooltipTableCell>
                <TooltipTableCell style={{ textAlign: 'right' }}>{formattedValue}</TooltipTableCell>
              </TooltipTableRow>
            );
          })}
        </TooltipTableBody>
      </TooltipTable>
    </TooltipContainer>
  );
}
