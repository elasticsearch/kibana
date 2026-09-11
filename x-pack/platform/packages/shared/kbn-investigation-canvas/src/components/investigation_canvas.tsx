/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiCallOut, useEuiTheme } from '@elastic/eui';
import {
  Chart,
  Settings,
  Axis,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramBarSeries,
  Partition,
  Metric,
  LineAnnotation,
  RectAnnotation,
  Position,
  ScaleType,
  PartitionLayout,
  LIGHT_THEME,
  DARK_THEME,
} from '@elastic/charts';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JsxParser = require('react-jsx-parser').default;
import {
  Section,
  StatTile,
  DataTable,
  KeyFindings,
  Badge,
  CodeBlock,
  Timeline,
} from './canvas_components';

interface Props {
  canvas: string;
}

const stripCdata = (s: string): string => {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)]]>\s*$/);
  return m ? m[1].trim() : s.trim();
};

export const InvestigationCanvas = ({ canvas }: Props) => {
  const { colorMode } = useEuiTheme();
  const baseTheme = colorMode === 'DARK' ? DARK_THEME : LIGHT_THEME;
  const [error, setError] = useState<string | null>(null);
  const jsx = stripCdata(canvas);

  if (error) {
    return (
      <EuiCallOut title="Canvas failed to render" color="warning" iconType="warning">
        <p>{error}</p>
      </EuiCallOut>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ChartWithHeight = ({ height = 300, children, ...rest }: any) => (
    <div style={{ height }}>
      <Chart {...rest}>{children}</Chart>
    </div>
  );

  return (
    <JsxParser
      jsx={jsx}
      components={
        {
          Chart: ChartWithHeight,
          Settings,
          Axis,
          BarSeries,
          LineSeries,
          AreaSeries,
          HistogramBarSeries,
          Partition,
          Metric,
          LineAnnotation,
          RectAnnotation,
          Section,
          StatTile,
          DataTable,
          KeyFindings,
          Badge,
          CodeBlock,
          Timeline,
        } as any
      }
      bindings={{ baseTheme, Position, ScaleType, PartitionLayout }}
      allowUnknownElements={false}
      renderInWrapper={false}
      onError={(err: Error) => setError(err.message)}
    />
  );
};
