/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import type { EuiThemeComputed } from '@elastic/eui';
import { EuiBasicTable } from '@elastic/eui';
import { css } from '@emotion/react';
import type { EpisodeEventFieldValueRow } from '../../utils/resolve_episode_event_data';
import { eventDataToFieldValueRows } from '../../utils/resolve_episode_event_data';
import * as i18n from './translations';

export interface SeverityHeatmapEventDataTableProps {
  eventData: Record<string, unknown> | null;
  euiTheme: EuiThemeComputed;
  dataTestSubj?: string;
  fullWidth?: boolean;
}

export const SeverityHeatmapEventDataTable = ({
  eventData,
  euiTheme,
  dataTestSubj = 'alertingV2EpisodeSeverityHeatmapTooltip',
  fullWidth = false,
}: SeverityHeatmapEventDataTableProps) => {
  const items = useMemo(() => eventDataToFieldValueRows(eventData), [eventData]);

  const columns = useMemo(
    () => [
      {
        field: 'field',
        name: i18n.SEVERITY_HEATMAP_TOOLTIP_FIELD_COLUMN,
        truncateText: !fullWidth,
      },
      {
        field: 'value',
        name: i18n.SEVERITY_HEATMAP_TOOLTIP_VALUE_COLUMN,
        truncateText: !fullWidth,
      },
    ],
    [fullWidth]
  );

  return (
    <div
      data-test-subj={dataTestSubj}
      css={css`
        max-width: ${fullWidth ? '100%' : '480px'};
        max-height: 320px;
        overflow: auto;
        padding: ${fullWidth ? 0 : `${euiTheme.size.xs} ${euiTheme.size.s}`};
      `}
    >
      <EuiBasicTable<EpisodeEventFieldValueRow>
        tableCaption={i18n.SEVERITY_HEATMAP_EVENT_DATA_TABLE_CAPTION}
        items={items}
        columns={columns}
        tableLayout={fullWidth ? 'fixed' : 'auto'}
        compressed
      />
    </div>
  );
};
