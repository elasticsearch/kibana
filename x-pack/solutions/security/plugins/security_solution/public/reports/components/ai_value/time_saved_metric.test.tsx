/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TimeSavedMetric } from './time_saved_metric';
import { VisualizationEmbeddable } from '../../../common/components/visualization_actions/visualization_embeddable';
import { getTimeSavedMetricLensAttributes } from '../../../common/components/visualization_actions/lens_attributes/ai/time_saved_metric';
import { VisualizationContextMenuActions } from '../../../common/components/visualization_actions/types';
import { useSignalIndexWithDefault } from '../../hooks/use_signal_index_with_default';
import { PageScope } from '../../../data_view_manager/constants';
import * as i18n from './translations';

jest.mock('../../../common/components/visualization_actions/visualization_embeddable', () => ({
  VisualizationEmbeddable: jest.fn(() => <div data-test-subj="mock-visualization-embeddable" />),
}));

jest.mock(
  '../../../common/components/visualization_actions/lens_attributes/ai/time_saved_metric',
  () => ({
    getTimeSavedMetricLensAttributes: jest.fn(),
  })
);

jest.mock('../../hooks/use_signal_index_with_default', () => ({
  useSignalIndexWithDefault: jest.fn(),
}));

jest.mock('./sample_metric', () => ({
  SampleMetric: jest.fn(({ title }: { title: string }) => (
    <div data-test-subj="mock-sample-metric">{title}</div>
  )),
}));

const mockGetTimeSavedMetricLensAttributes =
  getTimeSavedMetricLensAttributes as jest.MockedFunction<typeof getTimeSavedMetricLensAttributes>;
const mockUseSignalIndexWithDefault = useSignalIndexWithDefault as jest.MockedFunction<
  typeof useSignalIndexWithDefault
>;

const defaultProps = {
  isSample: false as const,
  from: '2023-01-01T00:00:00.000Z',
  to: '2023-01-31T23:59:59.999Z',
  minutesPerAlert: 10,
};

describe('TimeSavedMetric', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSignalIndexWithDefault.mockReturnValue('.alerts-security.alerts-default');
    mockGetTimeSavedMetricLensAttributes.mockReturnValue({
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
                    customLabel: true,
                    dataType: 'number',
                    isBucketed: false,
                    label: 'Analyst time saved',
                    operationType: 'formula',
                    params: {
                      format: { id: 'number', params: { decimals: 0 } },
                    },
                    references: ['countColumnX1'],
                  },
                },
                incompleteColumns: {},
              },
            },
          },
        },
        filters: [],
        internalReferences: [],
        query: { language: 'kuery', query: '_id:*' },
        visualization: {
          icon: 'clock',
          iconAlign: 'right',
          valuesTextAlign: 'left',
          layerId: 'unifiedHistogram',
          layerType: 'data',
          metricAccessor: 'count_column',
          secondaryTrend: { type: 'none' },
          showBar: false,
        },
      },
      title: 'Analyst time saved',
      visualizationType: 'lnsMetric',
      references: [],
    });
  });

  it('passes all required props to VisualizationEmbeddable', () => {
    render(<TimeSavedMetric {...defaultProps} />);

    expect(VisualizationEmbeddable).toHaveBeenCalledWith(
      expect.objectContaining({
        'data-test-subj': 'time-saved-metric',
        timerange: {
          from: defaultProps.from,
          to: defaultProps.to,
        },
        id: 'TimeSavedMetricQuery-metric',
        scopeId: PageScope.alerts,
        withActions: [
          VisualizationContextMenuActions.addToCase,
          VisualizationContextMenuActions.inspect,
        ],
      }),
      {}
    );
  });

  it('passes getLensAttributes function to VisualizationEmbeddable', () => {
    render(<TimeSavedMetric {...defaultProps} />);

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    expect(callArgs.getLensAttributes).toBeDefined();
    expect(callArgs.getLensAttributes).toEqual(expect.any(Function));
  });

  it('getLensAttributes function calls getTimeSavedMetricLensAttributes with correct args', () => {
    render(<TimeSavedMetric {...defaultProps} />);

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const mockArgs = {
      euiTheme: { colors: {} },
      extraOptions: { filters: [] },
    };

    callArgs.getLensAttributes(mockArgs);

    expect(mockGetTimeSavedMetricLensAttributes).toHaveBeenCalledWith({
      ...mockArgs,
      minutesPerAlert: defaultProps.minutesPerAlert,
      signalIndexName: '.alerts-security.alerts-default',
    });
  });

  it('handles different minutesPerAlert values', () => {
    const testCases = [
      { minutesPerAlert: 0, description: 'zero' },
      { minutesPerAlert: 60, description: 'large' },
      { minutesPerAlert: 5.5, description: 'decimal' },
    ];

    testCases.forEach(({ minutesPerAlert }) => {
      jest.clearAllMocks();

      const props = { ...defaultProps, minutesPerAlert };
      render(<TimeSavedMetric {...props} />);

      const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
      const mockArgs = {
        euiTheme: { colors: {} },
        extraOptions: { filters: [] },
      };

      callArgs.getLensAttributes(mockArgs);

      expect(mockGetTimeSavedMetricLensAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          minutesPerAlert,
          signalIndexName: '.alerts-security.alerts-default',
        })
      );
    });
  });

  it('calls useSignalIndexWithDefault hook', () => {
    render(<TimeSavedMetric {...defaultProps} />);
    expect(mockUseSignalIndexWithDefault).toHaveBeenCalled();
  });

  it('passes signalIndexName from useSignalIndexWithDefault to getLensAttributes', () => {
    const customSignalIndexName = '.alerts-security.alerts-custom-space';
    mockUseSignalIndexWithDefault.mockReturnValue(customSignalIndexName);

    render(<TimeSavedMetric {...defaultProps} />);

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const mockArgs = {
      euiTheme: { colors: {} },
      extraOptions: { filters: [] },
    };
    callArgs.getLensAttributes(mockArgs);

    expect(mockGetTimeSavedMetricLensAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        signalIndexName: customSignalIndexName,
      })
    );
  });

  it('memoizes timerange based on from and to props', () => {
    const { rerender } = render(<TimeSavedMetric {...defaultProps} />);
    const initialCallCount = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls.length;

    rerender(<TimeSavedMetric {...defaultProps} />);
    const finalCallCount = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls.length;
    expect(finalCallCount).toBe(initialCallCount);
  });

  it('recalculates timerange when from or to props change', () => {
    const { rerender } = render(<TimeSavedMetric {...defaultProps} />);
    jest.clearAllMocks();
    const newProps = {
      ...defaultProps,
      from: '2023-02-01T00:00:00.000Z',
      to: '2023-02-28T23:59:59.999Z',
    };
    rerender(<TimeSavedMetric {...newProps} />);

    expect(VisualizationEmbeddable).toHaveBeenCalledWith(
      expect.objectContaining({
        timerange: {
          from: newProps.from,
          to: newProps.to,
        },
      }),
      {}
    );
  });

  it('memoizes getLensAttributes function based on minutesPerAlert', () => {
    const { rerender } = render(<TimeSavedMetric {...defaultProps} />);

    const firstCallArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const firstGetLensAttributes = firstCallArgs.getLensAttributes;
    rerender(<TimeSavedMetric {...defaultProps} />);
    const callCount = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls.length;
    expect(callCount).toBe(1);
    const secondCallArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const secondGetLensAttributes = secondCallArgs.getLensAttributes;
    expect(firstGetLensAttributes).toBe(secondGetLensAttributes);
  });

  it('recalculates getLensAttributes function when minutesPerAlert changes', () => {
    const { rerender } = render(<TimeSavedMetric {...defaultProps} />);

    const firstCallArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const firstGetLensAttributes = firstCallArgs.getLensAttributes;
    jest.clearAllMocks();
    const newProps = {
      ...defaultProps,
      minutesPerAlert: 15,
    };
    rerender(<TimeSavedMetric {...newProps} />);

    const secondCallArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const secondGetLensAttributes = secondCallArgs.getLensAttributes;
    expect(firstGetLensAttributes).not.toBe(secondGetLensAttributes);
  });

  it('handles different time ranges correctly', () => {
    const propsWithDifferentRange = {
      ...defaultProps,
      from: '2023-06-01T00:00:00.000Z',
      to: '2023-06-30T23:59:59.999Z',
    };

    render(<TimeSavedMetric {...propsWithDifferentRange} />);

    expect(VisualizationEmbeddable).toHaveBeenCalledWith(
      expect.objectContaining({
        timerange: {
          from: propsWithDifferentRange.from,
          to: propsWithDifferentRange.to,
        },
      }),
      {}
    );
  });

  describe('sample variant', () => {
    it('renders the sample metric and skips the live Lens visualization', () => {
      render(<TimeSavedMetric {...defaultProps} isSample={true} />);
      expect(VisualizationEmbeddable).not.toHaveBeenCalled();
      expect(screen.getByTestId('mock-sample-metric')).toBeInTheDocument();
      expect(screen.getByText(i18n.TIME_SAVED)).toBeInTheDocument();
    });
  });
});
