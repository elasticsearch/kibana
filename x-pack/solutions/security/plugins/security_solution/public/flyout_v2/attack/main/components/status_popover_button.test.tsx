/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import userEvent from '@testing-library/user-event';

import { StatusPopoverButton } from './status_popover_button';
import { TestProviders } from '../../../../common/mock';
import type { DataTableRecord } from '@kbn/discover-utils';
import { useAttackWorkflowStatusContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_workflow_status_context_menu_items';

jest.mock('../../../../common/hooks/use_space_id', () => ({
  useSpaceId: () => 'default',
}));

jest.mock(
  '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_workflow_status_context_menu_items',
  () => ({
    useAttackWorkflowStatusContextMenuItems: jest.fn(),
  })
);

jest.mock('../../../../attack_discovery/pages/use_find_attack_discoveries', () => ({
  useInvalidateFindAttackDiscoveries: () => jest.fn(),
}));

jest.mock('../../../../attack_discovery/pages/use_attack_discovery_bulk', () => ({
  useAttackDiscoveryBulk: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock(
  '../../../../attack_discovery/pages/results/take_action/use_update_alerts_status',
  () => ({
    useUpdateAlertsStatus: () => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
    }),
  })
);

const buildHit = (overrides: Record<string, unknown> = {}): DataTableRecord =>
  ({
    id: 'attack-id',
    raw: { _id: 'attack-id', _index: '.alerts-security.alerts-default' },
    flattened: {
      _id: 'attack-id',
      _index: '.alerts-security.alerts-default',
      'kibana.alert.workflow_status': 'open',
      'kibana.alert.attack_discovery.alert_ids': ['alert-1', 'alert-2'],
      ...overrides,
    },
  } as unknown as DataTableRecord);

describe('StatusPopoverButton (attack flyout v2)', () => {
  const onAttackUpdated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useAttackWorkflowStatusContextMenuItems as jest.Mock).mockImplementation(
      ({ onSuccess }: { onSuccess: () => void }) => ({
        items: [
          {
            name: 'Mark as acknowledged',
            onClick: () => onSuccess(),
          },
          {
            name: 'Mark as closed',
            onClick: () => onSuccess(),
          },
        ],
        panels: [],
      })
    );
  });

  test('renders the current status value', () => {
    render(
      <TestProviders>
        <StatusPopoverButton hit={buildHit()} disabled={false} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  test('passes correct telemetry source', () => {
    render(
      <TestProviders>
        <StatusPopoverButton hit={buildHit()} disabled={false} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );
    expect(useAttackWorkflowStatusContextMenuItems).toHaveBeenCalledWith(
      expect.objectContaining({
        telemetrySource: 'attacks_page_flyout_header',
      })
    );
  });

  test('passes attackId and alertIds from hit', () => {
    render(
      <TestProviders>
        <StatusPopoverButton hit={buildHit()} disabled={false} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );
    expect(useAttackWorkflowStatusContextMenuItems).toHaveBeenCalledWith(
      expect.objectContaining({
        attacksWithWorkflowStatus: [
          expect.objectContaining({
            attackId: 'attack-id',
            relatedAlertIds: ['alert-1', 'alert-2'],
            workflowStatus: 'open',
          }),
        ],
      })
    );
  });

  test('shows the change status popover when clicked', async () => {
    const user = userEvent.setup();

    render(
      <TestProviders>
        <StatusPopoverButton hit={buildHit()} disabled={false} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );

    await user.click(screen.getByText('open'));
    await waitForEuiPopoverOpen();

    expect(screen.getByText('Change attack status')).toBeInTheDocument();
    expect(screen.getByText('Mark as acknowledged')).toBeInTheDocument();
    expect(screen.getByText('Mark as closed')).toBeInTheDocument();
  });

  test('calls onAttackUpdated after a status change', async () => {
    const user = userEvent.setup();

    render(
      <TestProviders>
        <StatusPopoverButton hit={buildHit()} disabled={false} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );

    await user.click(screen.getByText('open'));
    await waitForEuiPopoverOpen();
    await user.click(screen.getByText('Mark as acknowledged'));

    expect(onAttackUpdated).toHaveBeenCalledTimes(1);
  });

  test('does not open the popover when disabled=true', async () => {
    const user = userEvent.setup();

    render(
      <TestProviders>
        <StatusPopoverButton hit={buildHit()} disabled={true} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );

    await user.click(screen.getByText('open'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Change attack status')).not.toBeInTheDocument();
  });

  test('does not open the popover when there are no action items', async () => {
    (useAttackWorkflowStatusContextMenuItems as jest.Mock).mockImplementation(() => ({
      items: [],
      panels: [],
    }));

    const user = userEvent.setup();

    render(
      <TestProviders>
        <StatusPopoverButton hit={buildHit()} disabled={false} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );

    await user.click(screen.getByText('open'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Change attack status')).not.toBeInTheDocument();
  });

  test('deduplicates alert ids from hit', () => {
    const hitWithDuplicates = buildHit({
      'kibana.alert.attack_discovery.alert_ids': ['alert-1', 'alert-1', 'alert-2'],
    });

    render(
      <TestProviders>
        <StatusPopoverButton
          hit={hitWithDuplicates}
          disabled={false}
          onAttackUpdated={onAttackUpdated}
        />
      </TestProviders>
    );

    expect(useAttackWorkflowStatusContextMenuItems).toHaveBeenCalledWith(
      expect.objectContaining({
        attacksWithWorkflowStatus: [
          expect.objectContaining({
            relatedAlertIds: ['alert-1', 'alert-2'],
          }),
        ],
      })
    );
  });
});
