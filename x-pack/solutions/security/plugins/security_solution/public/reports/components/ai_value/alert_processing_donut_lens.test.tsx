/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { AlertProcessingDonut } from './alert_processing_donut_lens';
import { VisualizationEmbeddable } from '../../../common/components/visualization_actions/visualization_embeddable';
import { getAlertProcessingDonutAttributes } from '../../../common/components/visualization_actions/lens_attributes/ai/alert_processing_donut';
import { useSpaceId } from '../../../common/hooks/use_space_id';
import { VisualizationContextMenuActions } from '../../../common/components/visualization_actions/types';
import { PageScope } from '../../../data_view_manager/constants';
import { I18nProvider } from '@kbn/i18n-react';
import { DonutChartWrapper } from '../../../common/components/charts/donutchart';

jest.mock('../../../common/components/visualization_actions/visualization_embeddable', () => ({
  VisualizationEmbeddable: jest.fn(() => <div data-test-subj="mock-visualization-embeddable" />),
}));

jest.mock('../../../common/components/charts/donutchart', () => ({
  DonutChartWrapper: jest.fn(({ children }) => (
    <div data-test-subj="mock-donut-chart-wrapper">{children}</div>
  )),
}));

jest.mock(
  '../../../common/components/visualization_actions/lens_attributes/ai/alert_processing_donut',
  () => ({
    getAlertProcessingDonutAttributes: jest.fn(),
  })
);

jest.mock('../../../common/hooks/use_space_id', () => ({
  useSpaceId: jest.fn(),
}));

const mockGetAlertProcessingDonutAttributes =
  getAlertProcessingDonutAttributes as jest.MockedFunction<
    typeof getAlertProcessingDonutAttributes
  >;
const mockUseSpaceId = useSpaceId as jest.MockedFunction<typeof useSpaceId>;

const defaultProps = {
  isSample: false as const,
  attackAlertIds: ['alert-1', 'alert-2', 'alert-3'],
  from: '2023-01-01T00:00:00.000Z',
  to: '2023-01-31T23:59:59.999Z',
};

describe('AlertProcessingDonut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSpaceId.mockReturnValue('test-space-id');
  });

  it('sample data is not rendering the VisualizationEmbeddable and does render sample component', () => {
    render(
      <I18nProvider>
        <AlertProcessingDonut {...defaultProps} isSample={true} />
      </I18nProvider>
    );

    expect(VisualizationEmbeddable).not.toHaveBeenCalled();
    expect(DonutChartWrapper).toHaveBeenCalled();
  });

  it('calls useSpaceId hook and passes correct props to VisualizationEmbeddable', () => {
    render(<AlertProcessingDonut {...defaultProps} />);

    expect(mockUseSpaceId).toHaveBeenCalled();
    expect(VisualizationEmbeddable).toHaveBeenCalledWith(
      expect.objectContaining({
        applyGlobalQueriesAndFilters: false,
        height: 250,
        width: '100%',
        id: 'aiValueAlertProcessingDonut-:r0:',
        isDonut: true,
        donutTitleLabel: 'Total alerts processed',
        donutTextWrapperClassName: 'donutText',
        scopeId: PageScope.alerts,
        timerange: { from: defaultProps.from, to: defaultProps.to },
        withActions: [
          VisualizationContextMenuActions.addToCase,
          VisualizationContextMenuActions.inspect,
        ],
        getLensAttributes: expect.any(Function),
      }),
      {}
    );

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    expect(callArgs.getLensAttributes).toBeDefined();
    expect(callArgs.getLensAttributes).toEqual(expect.any(Function));
  });

  it('calls getLensAttributes with correct parameters', () => {
    render(<AlertProcessingDonut {...defaultProps} />);

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const mockArgs = {
      euiTheme: { colors: {} },
      extraOptions: { filters: [] },
    };

    callArgs.getLensAttributes(mockArgs);

    expect(mockGetAlertProcessingDonutAttributes).toHaveBeenCalledWith({
      ...mockArgs,
      attackAlertIds: defaultProps.attackAlertIds,
      spaceId: 'test-space-id',
    });
  });

  it('handles null/undefined spaceId by defaulting to "default"', () => {
    mockUseSpaceId.mockReturnValue(undefined);
    render(<AlertProcessingDonut {...defaultProps} />);

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const mockArgs = {
      euiTheme: { colors: {} },
      extraOptions: { filters: [] },
    };

    callArgs.getLensAttributes(mockArgs);

    expect(mockGetAlertProcessingDonutAttributes).toHaveBeenCalledWith({
      ...mockArgs,
      attackAlertIds: defaultProps.attackAlertIds,
      spaceId: 'default',
    });
  });

  it('handles empty attackAlertIds correctly', () => {
    const propsWithEmptyIds = { ...defaultProps, attackAlertIds: [] };
    render(<AlertProcessingDonut {...propsWithEmptyIds} />);

    const callArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const mockArgs = {
      euiTheme: { colors: {} },
      extraOptions: { filters: [] },
    };

    callArgs.getLensAttributes(mockArgs);
    expect(mockGetAlertProcessingDonutAttributes).toHaveBeenCalledWith({
      ...mockArgs,
      attackAlertIds: [],
      spaceId: 'test-space-id',
    });
  });
  it('returns a unique embeddable id per instance', () => {
    render(
      <>
        <AlertProcessingDonut {...defaultProps} />
        <AlertProcessingDonut {...defaultProps} />
      </>
    );

    const firstCallArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[0][0];
    const secondCallArgs = (VisualizationEmbeddable as unknown as jest.Mock).mock.calls[1][0];

    expect(firstCallArgs.id).not.toEqual(secondCallArgs.id);
  });
});
