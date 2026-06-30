/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TriggerIcon, WorkflowsTriggersList } from './worflows_triggers_list';

jest.mock('@kbn/workflows', () => ({
  isTriggerType: jest.fn((type: string) => ['alert', 'manual', 'scheduled'].includes(type)),
}));

jest.mock('../../trigger_schemas', () => ({
  triggerSchemas: {
    getTriggerDefinition: jest.fn(() => undefined),
  },
}));

describe('WorkflowsTriggersList', () => {
  it('renders the empty state when triggers array is empty', () => {
    render(<WorkflowsTriggersList triggers={[]} />);
    expect(screen.getByText('No triggers')).toBeInTheDocument();
  });

  it('renders a single trigger as an icon with the label as a tooltip title', () => {
    render(<WorkflowsTriggersList triggers={[{ type: 'manual' }]} />);
    expect(document.querySelector('[title="Manual"]')).toBeInTheDocument();
  });

  it('renders the first trigger and an overflow badge for multiple triggers', () => {
    render(<WorkflowsTriggersList triggers={[{ type: 'alert' }, { type: 'manual' }]} />);
    expect(document.querySelector('[title="Alert"]')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('renders the first trigger and overflow badge for three triggers', () => {
    render(
      <WorkflowsTriggersList
        triggers={[{ type: 'alert' }, { type: 'manual' }, { type: 'scheduled' }]}
      />
    );
    expect(document.querySelector('[title="Alert"]')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('uses capitalized type as the title for unknown trigger types', () => {
    render(<WorkflowsTriggersList triggers={[{ type: 'custom_thing' }]} />);
    expect(document.querySelector('[title="Custom_thing"]')).toBeInTheDocument();
  });

  describe('responsive structure', () => {
    it('renders trigger icon with title attribute for native tooltip', () => {
      render(<WorkflowsTriggersList triggers={[{ type: 'manual' }]} />);
      const icon = document.querySelector('[title="Manual"]');
      expect(icon).toBeInTheDocument();
    });

    it('renders only the icon (no inline label text) for a single trigger', () => {
      render(<WorkflowsTriggersList triggers={[{ type: 'alert' }]} />);
      expect(screen.queryByText('Alert')).not.toBeInTheDocument();
    });

    it('renders the "No triggers" text for empty triggers', () => {
      render(<WorkflowsTriggersList triggers={[]} />);
      expect(screen.getByText('No triggers')).toBeInTheDocument();
    });
  });
});

describe('TriggerIcon', () => {
  it('should render the scheduled label as tooltip when next execution is unavailable', () => {
    render(<TriggerIcon triggerType="scheduled" />);
    expect(document.querySelector('[title="Scheduled"]')).toBeInTheDocument();
  });

  it('should render scheduled label and next execution in tooltip when data is available', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TriggerIcon triggerType="scheduled" nextExecution="Jan 15, 2025 11:00 AM" />
    );

    expect(container.querySelector('.euiToolTipAnchor')).toBeInTheDocument();

    const anchor = container.querySelector('.euiToolTipAnchor');
    await user.hover(anchor!);

    expect(await screen.findByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Next execution: Jan 15, 2025 11:00 AM')).toBeInTheDocument();
  });

  it('should render only next execution in tooltip when showLabelInTooltip is false', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TriggerIcon
        triggerType="scheduled"
        nextExecution="Jan 15, 2025 11:00 AM"
        showLabelInTooltip={false}
      />
    );

    const anchor = container.querySelector('.euiToolTipAnchor');
    await user.hover(anchor!);

    expect(await screen.findByText('Next execution: Jan 15, 2025 11:00 AM')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
  });
});
