/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TooltipFeature } from '@kbn/maps-plugin/common';
import { MapToolTipComponent } from './map_tool_tip';
import * as i18n from '../translations';
import { TestProviders } from '../../../../../common/mock';

jest.mock('./line_tool_tip_content', () => ({
  LineToolTipContent: jest.fn(() => <div data-test-subj="line-tool-tip-content" />),
}));

jest.mock('./point_tool_tip_content', () => ({
  PointToolTipContent: jest.fn(() => <div data-test-subj="point-tool-tip-content" />),
}));

describe('MapToolTipComponent', () => {
  const mockCloseTooltip = jest.fn();
  const mockGetLayerName = jest.fn();
  const mockLoadFeatureProperties = jest.fn();
  const mockLoadFeatureGeometry = jest.fn();
  const features = [
    { layerId: 'layer1', id: 'feature1', mbProperties: {} },
    { layerId: 'layer2', id: 'feature2', mbProperties: {} },
  ] as TooltipFeature[];

  const renderComponent = (props = {}) => {
    return render(
      <MapToolTipComponent
        closeTooltip={mockCloseTooltip}
        features={features}
        getLayerName={mockGetLayerName}
        loadFeatureProperties={mockLoadFeatureProperties}
        loadFeatureGeometry={mockLoadFeatureGeometry}
        {...props}
      />,
      { wrapper: TestProviders }
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLayerName.mockResolvedValue('Layer Name');
    mockLoadFeatureProperties.mockResolvedValue([{ name: 'property1', value: 'value1' }]);
    mockLoadFeatureGeometry.mockResolvedValue({ type: 'Point' });
  });

  it('should not render tooltips when features is empty', () => {
    renderComponent({ features: [] });
    expect(screen.queryByTestId('point-tool-tip-content')).toBeNull();
  });

  it('shows a loading spinner initially', () => {
    const { container } = renderComponent();
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it('displays an error message when isError is true', async () => {
    mockLoadFeatureProperties.mockRejectedValue(new Error('Load error'));
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(i18n.MAP_TOOL_TIP_ERROR)).toBeInTheDocument();
    });
  });

  it('displays PointToolTipContent and ToolTipFooter when feature geometry is Point', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('point-tool-tip-content')).toBeInTheDocument();
      expect(screen.getByTestId('previous-feature-button')).toBeInTheDocument();
      expect(screen.getByTestId('next-feature-button')).toBeInTheDocument();
    });
  });

  it('navigates to the next and previous features correctly', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('previous-feature-button')).toBeInTheDocument();
      expect(screen.getByTestId('next-feature-button')).toBeInTheDocument();
    });

    const nextButton = screen.getByTestId('next-feature-button');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(mockLoadFeatureProperties).toHaveBeenCalledWith({
        layerId: 'layer2',
        properties: {},
      });
    });

    const previousButton = screen.getByTestId('previous-feature-button');
    fireEvent.click(previousButton);

    await waitFor(() => {
      expect(mockLoadFeatureProperties).toHaveBeenCalledWith({
        layerId: 'layer1',
        properties: {},
      });
    });
  });
});
