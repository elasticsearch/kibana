/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { LensAttributes } from '@kbn/lens-embeddable-utils/config_builder';
import { ChangePointLensChart } from './change_point_lens_chart';
import type { ChangePointCardModel } from '../utils/derive_change_point_cards';
import type { ChangePointLensChartProps } from './change_point_lens_chart';

// ---- module mocks ----

jest.mock('../hooks/use_change_point_lens_props');
jest.mock('@kbn/embeddable-plugin/public', () => ({
  EmbeddableRendererContext: {
    Provider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  },
}));
jest.mock('./change_point_badge', () => ({
  ChangePointBadge: () => null,
}));
jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useEuiTheme: () => ({
      euiTheme: {
        colors: { danger: '#BD271E', lightShade: '#eee' },
        border: { width: { thin: '1px' }, radius: { medium: '6px' } },
        size: { xs: '4px', s: '8px' },
      },
    }),
  };
});

// ---- helpers ----

const { useChangePointLensProps } = jest.requireMock('../hooks/use_change_point_lens_props');

const stubCard = (overrides: Partial<ChangePointCardModel> = {}): ChangePointCardModel => ({
  id: 'card-1',
  title: 'Test series',
  lineEsql: 'FROM idx | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1d)',
  annotationEvents: [],
  changePointTypes: [],
  typeColumnId: 'type',
  pvalueColumnId: 'pvalue',
  entityValues: {},
  entityDescription: undefined,
  ...overrides,
});

const stubLensProps = {
  id: 'lens-1',
  title: 'Test series',
  timeRange: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T00:00:00.000Z' },
  attributes: {
    title: 'Test series',
    visualizationType: 'lnsXY',
    state: { query: { esql: 'FROM idx' }, filters: [], datasourceStates: {}, visualization: {} },
    references: [],
  } as unknown as LensAttributes,
} as never;

const EmbeddableComponentStub = () => <div data-test-subj="lensEmbeddable">lens stub</div>;

const baseProps: ChangePointLensChartProps = {
  card: stubCard(),
  cardIndex: 0,
  valueColumn: 'avg_bytes',
  timeColumn: 'bucket',
  services: {
    lens: { EmbeddableComponent: EmbeddableComponentStub },
  } as never,
  fetchParams: {
    timeRange: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T00:00:00.000Z' },
    abortController: new AbortController(),
    table: { columns: [], rows: [] },
    query: { esql: 'FROM idx' },
    filters: [],
    esqlVariables: [],
    relativeTimeRange: { from: 'now-30d', to: 'now' },
  } as never,
  fetch$: {} as never,
  onBrushEnd: undefined,
  onFilter: undefined,
  actions: undefined,
};

// ---- tests ----

describe('ChangePointLensChart', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders a loading indicator while lensProps is not yet available', () => {
    useChangePointLensProps.mockReturnValue({ lensProps: undefined, buildError: undefined });
    render(<ChangePointLensChart {...baseProps} />);
    // EuiLoadingChart renders an SVG with role="img" or an aria-label; check for the EUI class.
    const loading = document.querySelector('.euiLoadingChart');
    expect(loading).not.toBeNull();
  });

  it('renders a build error message when the hook returns an error', () => {
    useChangePointLensProps.mockReturnValue({
      lensProps: undefined,
      buildError: new Error('build failed'),
    });
    render(<ChangePointLensChart {...baseProps} />);
    expect(screen.getByText('Failed to load chart.')).toBeInTheDocument();
  });

  it('renders the embeddable when lensProps are available', () => {
    useChangePointLensProps.mockReturnValue({ lensProps: stubLensProps, buildError: undefined });
    render(<ChangePointLensChart {...baseProps} cardIndex={0} />);
    expect(screen.getByTestId('lensEmbeddable')).toBeInTheDocument();
    expect(screen.getByTestId('changePointLensChart-0')).toBeInTheDocument();
  });

  it('produces a single area series layer (no annotation layer) when card has no annotations', () => {
    const capturedLayers: unknown[] = [];
    useChangePointLensProps.mockImplementation(({ chartLayers }: { chartLayers: unknown }) => {
      capturedLayers.push(...(chartLayers as unknown[]));
      return { lensProps: stubLensProps, buildError: undefined };
    });

    render(<ChangePointLensChart {...baseProps} card={stubCard()} />);

    expect(capturedLayers).toHaveLength(1);
    expect((capturedLayers[0] as { type?: string }).type).toBe('series');
    expect((capturedLayers[0] as { seriesType?: string }).seriesType).toBe('area');
  });

  it('does not populate extraActions when there are no annotations', () => {
    let capturedExtraActions: unknown[] | undefined;
    const EmbeddableSpy = ({ extraActions }: { extraActions?: unknown[] }) => {
      capturedExtraActions = extraActions;
      return <div data-test-subj="lensEmbeddable" />;
    };
    useChangePointLensProps.mockReturnValue({ lensProps: stubLensProps, buildError: undefined });

    render(
      <ChangePointLensChart
        {...baseProps}
        services={{ lens: { EmbeddableComponent: EmbeddableSpy } } as never}
        card={stubCard({ annotationEvents: [] })}
        actions={{ openInNewTab: jest.fn() }}
      />
    );

    expect(capturedExtraActions).toHaveLength(0);
  });
});
