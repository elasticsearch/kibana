/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import type { BrushEndListener, XYChartElementEvent } from '@elastic/charts';
import {
  Axis,
  Chart,
  Position,
  ScaleType,
  Settings,
  TooltipHeader,
  TooltipContainer,
  TooltipTable,
  BarSeries,
} from '@elastic/charts';
import { EuiHorizontalRule, formatDate } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { parse } from '@kbn/datemath';
import type { TooltipValue } from '@elastic/charts/dist/specs';
import { useChartThemes } from '../../hooks/use_chart_themes';
import type { useAnnotations } from '../../components/annotations/use_annotations';
import type { Annotation } from '../../../common/annotations';

export function AnnotationsListChart({
  data,
  start,
  end,
  createAnnotation,
  ObservabilityAnnotations,
  onAnnotationClick,
}: {
  data: Annotation[];
  start: string;
  end: string;
  createAnnotation: ReturnType<typeof useAnnotations>['createAnnotation'];
  ObservabilityAnnotations: ReturnType<typeof useAnnotations>['ObservabilityAnnotations'];
  onAnnotationClick: ReturnType<typeof useAnnotations>['onAnnotationClick'];
}) {
  const brushEndListener: BrushEndListener = ({ x }) => {
    if (!x) {
      return;
    }
    const startX = x[0];
    const endX = x[1];
    createAnnotation(String(startX), String(endX));
  };

  const domain = useMemo(() => {
    return {
      min: parse(start)?.valueOf()!,
      max: parse(end, { roundUp: true })?.valueOf()!,
    };
  }, [end, start]);
  // we need at least two points for chart to render

  const domainPoints =
    // we need at least two points for chart to render
    [
      { x: domain.min, y: 1 },
      { x: domain.min + 1, y: 1 },
      { x: domain.min + 1, y: 1 },
      { x: domain.max, y: 1 },
    ];

  const { baseTheme } = useChartThemes();

  return (
    <>
      <Chart size={{ height: 300 }}>
        <Settings
          onElementClick={([geometry, _]) => {
            const point = geometry as XYChartElementEvent;
            if (!point) return;
            createAnnotation(point[0]?.x);
          }}
          onBrushEnd={brushEndListener}
          onAnnotationClick={onAnnotationClick}
          xDomain={domain}
          baseTheme={baseTheme}
          theme={{
            chartMargins: {
              top: 50,
            },
            barSeriesStyle: {
              rect: {
                opacity: 0,
              },
            },
          }}
        />
        <ObservabilityAnnotations
          annotations={data}
          tooltipSpecs={{
            customTooltip: (props) => <Tooltip {...props} />,
          }}
        />
        <Axis
          id="horizontal"
          position={Position.Bottom}
          title={i18n.translate('xpack.observability.annotationsListChart.axis.timestampLabel', {
            defaultMessage: '@timestamp',
          })}
          tickFormat={(d) => formatDate(d, 'longDateTime')}
          groupId="primary"
        />
        <Axis
          id="vertical"
          title={i18n.translate('xpack.observability.annotationsListChart.axis.yDomainLabel', {
            defaultMessage: 'Y Domain',
          })}
          position={Position.Left}
          hide={true}
        />
        <BarSeries
          id="bars"
          // Defaults to multi layer time axis as of Elastic Charts v70
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="x"
          yAccessors={['y']}
          data={domainPoints}
        />
      </Chart>
      <EuiHorizontalRule margin="s" />
    </>
  );
}

function Tooltip({
  header,
  values,
}: {
  header: {
    formattedValue?: string;
  } | null;
  values: TooltipValue[];
}) {
  return (
    <TooltipContainer>
      <TooltipHeader>{header?.formattedValue}</TooltipHeader>
      <TooltipTable
        columns={[
          { type: 'color' },
          {
            type: 'text',
            cell: (t) =>
              i18n.translate('xpack.observability.tooltip.p.clickToAddAnnotationLabel', {
                defaultMessage: 'Click to add annotation',
              }),
            style: { textAlign: 'left' },
          },
        ]}
        items={values}
      />
    </TooltipContainer>
  );
}
