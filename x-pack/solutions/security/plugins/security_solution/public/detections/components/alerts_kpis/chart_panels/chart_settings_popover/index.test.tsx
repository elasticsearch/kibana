/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';

import { ChartSettingsPopover } from '.';

describe('ChartSettingsPopover', () => {
  const setIsPopoverOpen = jest.fn();
  const initialPanelId = 'default-initial-panel';

  const panels = [
    {
      id: initialPanelId,
      items: [
        {
          icon: 'inspect',
          name: 'Inspect',
        },
        {
          name: 'Reset group by fields',
        },
      ],
    },
  ];

  it('renders the chart settings popover', () => {
    const { getByTestId } = render(
      <ChartSettingsPopover
        initialPanelId={initialPanelId}
        isPopoverOpen={false}
        panels={panels}
        setIsPopoverOpen={setIsPopoverOpen}
      />
    );

    expect(getByTestId('chart-settings-popover-button')).toBeInTheDocument();
  });
});
