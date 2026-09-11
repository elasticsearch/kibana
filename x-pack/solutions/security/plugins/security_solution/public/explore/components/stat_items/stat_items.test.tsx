/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { StatItemsComponent } from './stat_items';
import type { LensAttributes } from '../../../common/components/visualization_actions/types';
import { TestProviders } from '../../../common/mock/test_providers';
import { useToggleStatus } from './use_toggle_status';

jest.mock('../../../common/components/visualization_actions/visualization_embeddable');
jest.mock('../../hooks/use_explore_entity_store_v2_enabled', () => ({
  useExploreEntityStoreV2Enabled: jest.fn(() => false),
}));
jest.mock('./use_toggle_status', () => ({
  useToggleStatus: jest.fn().mockReturnValue({ isToggleExpanded: true, onToggle: jest.fn() }),
}));

describe('StatItemsComponent', () => {
  const mockStatItems = {
    key: 'hosts',
    fields: [
      {
        key: 'hosts',
        value: null,
        color: '#fff',
        icon: 'storage',
        lensAttributes: {} as LensAttributes,
      },
    ],
    enableAreaChart: true,
    description: 'Mock Description',
    areaChartLensAttributes: {} as LensAttributes,
  };

  const mockProps = {
    statItems: mockStatItems,
    from: new Date('2023-01-01').toISOString(),
    to: new Date('2023-12-31').toISOString(),
    id: 'mockId',
  };

  it('renders visualizations', () => {
    const { getByText, getAllByTestId } = render(<StatItemsComponent {...mockProps} />, {
      wrapper: TestProviders,
    });

    expect(getByText('Mock Description')).toBeInTheDocument();

    expect(getAllByTestId('visualization-embeddable')).toHaveLength(2);
  });

  it('toggles visualizations', () => {
    (useToggleStatus as jest.Mock).mockReturnValue({
      isToggleExpanded: false,
      onToggle: jest.fn(),
    });

    const { getByTestId, getAllByTestId } = render(<StatItemsComponent {...mockProps} />, {
      wrapper: TestProviders,
    });

    const toggleButton = getByTestId('query-toggle-stat');
    fireEvent.click(toggleButton);

    waitFor(() => {
      expect(getAllByTestId('visualization-embeddable')).toHaveLength(0);
    });
  });
});
