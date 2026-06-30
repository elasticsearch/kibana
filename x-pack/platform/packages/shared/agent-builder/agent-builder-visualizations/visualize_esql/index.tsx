/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChartType } from '@kbn/visualization-utils';
import React, { useCallback, useState } from 'react';
import { EuiSplitPanel } from '@elastic/eui';
import type { UseEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import type { EsqlResults } from '@kbn/agent-builder-common/tools/tool_result';
import type { TimeRange } from '@kbn/agent-builder-common';
import type { ActionButton } from '@kbn/agent-builder-browser/attachments';
import type { VisualizationServices } from '../services';
import { useLensInput } from './use_lens_input';
import { BaseVisualization } from '../shared/base_visualization';
import { FallbackVisualizationActions } from '../shared/visualization_actions';
import { visualizationWrapperStyles } from '../shared/styles';
import { getVisualizationDimensionsFromChartType } from '../shared/get_visualization_dimensions';

export function VisualizeESQL({
  services,
  esqlColumns,
  esqlQuery,
  preferredChartType,
  timeRange,
}: {
  services: VisualizationServices;
  esqlColumns: EsqlResults['data']['columns'] | undefined;
  esqlQuery: string;
  preferredChartType?: ChartType;
  errorMessages?: string[];
  timeRange?: TimeRange;
}) {
  const { lens, dataViews } = services;
  const { lensInput, setLensInput, isLoading } = useLensInput({
    lens,
    dataViews,
    esqlQuery,
    esqlColumns,
    preferredChartType,
    timeRange,
  });
  const { height, width } = getVisualizationDimensionsFromChartType(preferredChartType);
  const [actionButtons, setActionButtons] = useState<ActionButton[]>([]);
  const registerActionButtons = useCallback((buttons: ActionButton[]) => {
    setActionButtons(buttons);
  }, []);

  return (
    <EuiSplitPanel.Outer
      grow
      hasShadow={false}
      hasBorder={true}
      css={[
        visualizationWrapperStyles,
        width !== undefined ? css({ maxWidth: width }) : undefined,
        ({ euiTheme }: UseEuiTheme) =>
          css({
            marginBlockEnd: euiTheme.size.m,
          }),
      ]}
    >
      {actionButtons.length > 0 && <FallbackVisualizationActions buttons={actionButtons} />}
      <BaseVisualization
        services={services}
        lensInput={lensInput}
        setLensInput={setLensInput}
        isLoading={isLoading}
        registerActionButtons={registerActionButtons}
        height={height}
      />
    </EuiSplitPanel.Outer>
  );
}
