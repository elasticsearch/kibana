/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiPopover, EuiToolTip, EuiButtonEmpty, EuiIcon } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useFetcher } from '@kbn/observability-shared-plugin/public';
import type { ExploratoryViewPublicPluginsStart } from '../../../../../plugin';
import type { SeriesUrl } from '../../../../..';
import type { SeriesConfig } from '../../types';
import { SeriesChartTypesSelect } from './chart_types';

interface Props {
  seriesId: number;
  series: SeriesUrl;
  seriesConfig: SeriesConfig;
}

export function SeriesChartTypes({ seriesId, series, seriesConfig }: Props) {
  const seriesType = series?.seriesType ?? seriesConfig.defaultSeriesType;

  const {
    services: { lens },
  } = useKibana<ExploratoryViewPublicPluginsStart>();

  const { data = [] } = useFetcher(() => lens.getXyVisTypes(), [lens]);

  const icon = (data ?? []).find(({ id }) => id === seriesType)?.icon;

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.exploratoryView.seriesChartTypes.popoverAriaLabel', {
        defaultMessage: 'Edit chart type for series',
      })}
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
      button={
        <EuiToolTip content={EDIT_CHART_TYPE_LABEL}>
          <EuiButtonEmpty
            data-test-subj="o11ySeriesChartTypesButton"
            size="s"
            aria-label={CHART_TYPE_LABEL}
            onClick={() => setIsPopoverOpen((prevState) => !prevState)}
            flush="both"
          >
            {icon && (
              <EuiIcon
                type={(data ?? []).find(({ id }) => id === seriesType)?.icon!}
                size="l"
                aria-hidden={true}
              />
            )}
          </EuiButtonEmpty>
        </EuiToolTip>
      }
    >
      <SeriesChartTypesSelect
        seriesId={seriesId}
        series={series}
        defaultChartType={seriesConfig.defaultSeriesType}
      />
    </EuiPopover>
  );
}

const EDIT_CHART_TYPE_LABEL = i18n.translate(
  'xpack.exploratoryView.expView.seriesEditor.editChartSeriesLabel',
  {
    defaultMessage: 'Edit chart type for series',
  }
);

const CHART_TYPE_LABEL = i18n.translate('xpack.exploratoryView.expView.chartTypes.label', {
  defaultMessage: 'Chart type',
});
