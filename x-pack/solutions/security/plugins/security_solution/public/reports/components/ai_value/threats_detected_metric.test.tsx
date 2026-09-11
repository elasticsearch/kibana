/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThreatsDetectedMetric } from './threats_detected_metric';
import { VisualizationEmbeddable } from '../../../common/components/visualization_actions/visualization_embeddable';
import { getThreatsDetectedMetricLensAttributes } from '../../../common/components/visualization_actions/lens_attributes/ai/threats_detected_metric';
import { useSpaceId } from '../../../common/hooks/use_space_id';
import { VisualizationContextMenuActions } from '../../../common/components/visualization_actions/types';
import * as i18n from './translations';

// Mock dependencies
jest.mock('../../../common/components/visualization_actions/visualization_embeddable', () => ({
  VisualizationEmbeddable: jest.fn(() => <div data-test-subj="mock-visualization-embeddable" />),
}));

jest.mock(
  '../../../common/components/visualization_actions/lens_attributes/ai/threats_detected_metric',
  () => ({
    getThreatsDetectedMetricLensAttributes: jest.fn(),
  })
);

jest.mock('../../../common/hooks/use_space_id', () => ({
  useSpaceId: jest.fn(),
}));

jest.mock('./sample_metric', () => ({
  SampleMetric: jest.fn(({ title }: { title: string }) => (
    <div data-test-subj="mock-sample-metric">{title}</div>
  )),
}));

const mockGetThreatsDetectedMetricLensAttributes =
  getThreatsDetectedMetricLensAttributes as jest.MockedFunction<
    typeof getThreatsDetectedMetricLensAttributes
  >;
const mockUseSpaceId = useSpaceId as jest.MockedFunction<typeof useSpaceId>;

const defaultProps = {
  isSample: false as const,
  from: '2023-01-01T00:00:00.000Z',
  to: '2023-01-31T23:59:59.999Z',
};

describe('ThreatsDetectedMetric', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSpaceId.mockReturnValue('test-space-id');
    mockGetThreatsDetectedMetricLensAttributes.mockReturnValue({
      description: '',
      state: {
        adHocDataViews: {},
        datasourceStates: {
          formBased: {
            layers: {
              unifiedHistogram: {
                columnOrder: ['count_column'],
                columns: {
                  count_column: {
                    dataType: 'number',
                    isBucketed: false,
                    label: 'Count of records',
                    operationType: 'count',
                    sourceField: '___records___',
                  },
                },
                incompleteColumns: {},
              },
            },
          },
        },
        filters: [],
        query: { language: 'kuery', query: '' },
        visualization: {
          accessor: 'count_column',
          layerId: 'unifiedHistogram',
          layerType: 'data',
        },
      },
      title: 'Threats Detected',
      visualizationType: 'lnsMetric',
      references: [],
    });
  });

  it('calls useSpaceId hook', () => {
    render(<ThreatsDetectedMetric {...defaultProps} />);

    expect(mockUseSpaceId).toHaveBeenCalled();
  });

  it('passes all required props to VisualizationEmbeddable', () => {
    render(<ThreatsDetectedMetric {...defaultProps} />);

    expect(VisualizationEmbeddable).toHaveBeenCalledWith(
      expect.objectContaining({
        'data-test-subj': 'threats-detected-metric',
        timerange: {
          from: defaultProps.from,
          to: defaultProps.to,
        },
        id: 'ThreatsDetectedMetricQuery-area-embeddable',
        inspectTitle: 'Real threats detected',
        withActions: [
          VisualizationContextMenuActions.addToCase,
          VisualizationContextMenuActions.inspect,
        ],
      }),
      {}
    );
  });

  it('passes getLensAttributes function to VisualizationEmbeddable', () => {
    render(<ThreatsDetectedMetric {...defaultProps} />);

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    expect(callArgs.getLensAttributes).toBeDefined();
    expect(callArgs.getLensAttributes).toEqual(expect.any(Function));
  });

  it('getLensAttributes function calls getThreatsDetectedMetricLensAttributes with correct args', () => {
    render(<ThreatsDetectedMetric {...defaultProps} />);

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const mockArgs = {
      euiTheme: { colors: {} },
      extraOptions: { filters: [] },
    };

    callArgs.getLensAttributes(mockArgs);

    expect(mockGetThreatsDetectedMetricLensAttributes).toHaveBeenCalledWith({
      ...mockArgs,
      spaceId: 'test-space-id',
    });
  });

  it('handles null spaceId by defaulting to "default"', () => {
    mockUseSpaceId.mockReturnValue(undefined);
    render(<ThreatsDetectedMetric {...defaultProps} />);

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const mockArgs = {
      euiTheme: { colors: {} },
      extraOptions: { filters: [] },
    };

    callArgs.getLensAttributes(mockArgs);

    expect(mockGetThreatsDetectedMetricLensAttributes).toHaveBeenCalledWith({
      ...mockArgs,
      spaceId: 'default',
    });
  });

  it('passes correct timerange to VisualizationEmbeddable', () => {
    const customTimeRange = {
      from: '2023-01-01T00:00:00.000Z',
      to: '2023-01-02T00:00:00.000Z',
    };

    render(
      <ThreatsDetectedMetric isSample={false} from={customTimeRange.from} to={customTimeRange.to} />
    );

    expect(VisualizationEmbeddable).toHaveBeenCalledWith(
      expect.objectContaining({
        timerange: customTimeRange,
      }),
      {}
    );
  });

  it('memoizes the component correctly', () => {
    const { rerender } = render(<ThreatsDetectedMetric {...defaultProps} />);
    const initialCallCount = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls.length;
    rerender(<ThreatsDetectedMetric {...defaultProps} />);
    expect((VisualizationEmbeddable as unknown as jest.Mock).mock.calls.length).toBe(
      initialCallCount
    );
    rerender(
      <ThreatsDetectedMetric
        isSample={false}
        from="2023-02-01T00:00:00.000Z"
        to="2023-02-28T23:59:59.999Z"
      />
    );
    expect((VisualizationEmbeddable as unknown as jest.Mock).mock.calls.length).toBe(
      initialCallCount + 1
    );
  });

  describe('sample variant', () => {
    it('renders the sample metric and skips the live Lens visualization', () => {
      render(<ThreatsDetectedMetric {...defaultProps} isSample={true} />);
      expect(VisualizationEmbeddable).not.toHaveBeenCalled();
      expect(screen.getByTestId('mock-sample-metric')).toBeInTheDocument();
      expect(screen.getByText(i18n.THREATS_DETECTED)).toBeInTheDocument();
    });
  });
});
