/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { Assignees } from './assignees';
import { TestProviders } from '../../../../common/mock';
import { useAttackAssigneesContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_assignees_context_menu_items';
import { useInvalidateFindAttackDiscoveries } from '../../../../attack_discovery/pages/use_find_attack_discoveries';
import { useAttacksPrivileges } from '../../../../detections/hooks/attacks/bulk_actions/use_attacks_privileges';
import { useLicense } from '../../../../common/hooks/use_license';
import { useUpsellingMessage } from '../../../../common/hooks/use_upselling';
import {
  HEADER_ASSIGNEES_TEST_ID,
  HEADER_ASSIGNEES_EMPTY_TEST_ID,
  HEADER_ASSIGNEES_ADD_BUTTON_TEST_ID,
} from '../constants/test_ids';
import {
  USERS_AVATARS_PANEL_TEST_ID,
  USER_AVATAR_ITEM_TEST_ID,
} from '../../../../common/components/user_profiles/test_ids';
import type { DataTableRecord } from '@kbn/discover-utils';

jest.mock(
  '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_assignees_context_menu_items'
);
jest.mock('../../../../attack_discovery/pages/use_find_attack_discoveries');
jest.mock('../../../../detections/hooks/attacks/bulk_actions/use_attacks_privileges');
jest.mock('../../../../common/hooks/use_license');
jest.mock('../../../../common/hooks/use_upselling');
jest.mock('../../../../common/components/user_profiles/use_bulk_get_user_profiles', () => ({
  useBulkGetUserProfiles: ({ uids }: { uids: Set<string> }) => ({
    data:
      uids.size > 0
        ? [
            {
              uid: 'uid-1',
              enabled: true,
              user: { username: 'user1', full_name: 'User 1' },
              data: {},
            },
          ]
        : undefined,
  }),
}));
jest.mock('../../../../common/components/empty_value', () => ({
  getEmptyTagValue: () => '—',
}));

const mockUseAttackAssigneesContextMenuItems =
  useAttackAssigneesContextMenuItems as jest.MockedFunction<
    typeof useAttackAssigneesContextMenuItems
  >;
const mockUseInvalidateFindAttackDiscoveries =
  useInvalidateFindAttackDiscoveries as jest.MockedFunction<
    typeof useInvalidateFindAttackDiscoveries
  >;
const mockUseAttacksPrivileges = useAttacksPrivileges as jest.MockedFunction<
  typeof useAttacksPrivileges
>;
const mockUseLicense = useLicense as jest.MockedFunction<typeof useLicense>;
const mockUseUpsellingMessage = useUpsellingMessage as jest.MockedFunction<
  typeof useUpsellingMessage
>;

const mockInvalidateFindAttackDiscoveries = jest.fn();

const defaultMenuItems = {
  items: [{ name: 'Manage assignees', panel: 2, key: 'manage' }],
  panels: [{ id: 2, title: 'Assignees', content: <div data-test-subj="assignees-panel" /> }],
};

const buildHit = (
  overrides: Record<string, unknown> = {},
  rawOverrides: Record<string, unknown> = {}
): DataTableRecord =>
  ({
    id: 'attack-123',
    raw: { _id: 'attack-123', _index: '.alerts-security.alerts-default', ...rawOverrides },
    flattened: {
      _id: 'attack-123',
      _index: '.alerts-security.alerts-default',
      'kibana.alert.attack_discovery.alert_ids': ['alert-1', 'alert-2'],
      'kibana.alert.workflow_assignee_ids': ['uid-1'],
      ...overrides,
    },
  } as unknown as DataTableRecord);

const renderAssignees = (hit = buildHit(), onAttackUpdated = jest.fn()) =>
  render(
    <TestProviders>
      <Assignees hit={hit} onAttackUpdated={onAttackUpdated} />
    </TestProviders>
  );

describe('<Assignees /> (v2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAttackAssigneesContextMenuItems.mockReturnValue(defaultMenuItems);
    mockUseInvalidateFindAttackDiscoveries.mockReturnValue(mockInvalidateFindAttackDiscoveries);
    mockUseAttacksPrivileges.mockReturnValue({
      hasIndexWrite: true,
      hasAttackIndexWrite: true,
      loading: false,
    });
    mockUseLicense.mockReturnValue({
      isPlatinumPlus: () => true,
    } as ReturnType<typeof useLicense>);
    mockUseUpsellingMessage.mockReturnValue(undefined);
  });

  it('passes attacksWithAssignees and onSuccess to useAttackAssigneesContextMenuItems', () => {
    renderAssignees();

    expect(mockUseAttackAssigneesContextMenuItems).toHaveBeenCalledWith(
      expect.objectContaining({
        attacksWithAssignees: [
          {
            attackId: 'attack-123',
            relatedAlertIds: ['alert-1', 'alert-2'],
            assignees: ['uid-1'],
          },
        ],
        telemetrySource: 'attacks_page_flyout_header',
      })
    );
  });

  it('onSuccess calls onAttackUpdated and invalidateFindAttackDiscoveries', () => {
    const onAttackUpdated = jest.fn();
    let capturedOnSuccess: (() => void) | undefined;
    mockUseAttackAssigneesContextMenuItems.mockImplementation((args) => {
      capturedOnSuccess = args.onSuccess;
      return defaultMenuItems;
    });

    renderAssignees(buildHit(), onAttackUpdated);
    expect(capturedOnSuccess).toBeDefined();

    capturedOnSuccess!();

    expect(onAttackUpdated).toHaveBeenCalledTimes(1);
    expect(mockInvalidateFindAttackDiscoveries).toHaveBeenCalledTimes(1);
  });

  it('renders empty state when user has no permission', () => {
    mockUseAttacksPrivileges.mockReturnValue({
      hasIndexWrite: false,
      hasAttackIndexWrite: true,
      loading: false,
    });

    renderAssignees();

    expect(screen.getByTestId(HEADER_ASSIGNEES_EMPTY_TEST_ID)).toBeInTheDocument();
    expect(screen.getByTestId(HEADER_ASSIGNEES_EMPTY_TEST_ID)).toHaveTextContent('—');
    expect(screen.queryByTestId(HEADER_ASSIGNEES_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders empty state when not platinum plus', () => {
    mockUseLicense.mockReturnValue({
      isPlatinumPlus: () => false,
    } as ReturnType<typeof useLicense>);

    renderAssignees();

    expect(screen.getByTestId(HEADER_ASSIGNEES_EMPTY_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId(HEADER_ASSIGNEES_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders assignees block with add button and popover when has permission', () => {
    renderAssignees();

    expect(screen.getByTestId(HEADER_ASSIGNEES_TEST_ID)).toBeInTheDocument();
    expect(screen.getByTestId(HEADER_ASSIGNEES_ADD_BUTTON_TEST_ID)).toBeInTheDocument();
    expect(screen.getByTestId(HEADER_ASSIGNEES_ADD_BUTTON_TEST_ID)).not.toBeDisabled();
    expect(screen.getByTestId('attack-flyout-v2-header-assignees-popover')).toBeInTheDocument();
  });

  it('renders avatars when assignees are provided and user profiles loaded', () => {
    renderAssignees();

    expect(screen.getByTestId(USERS_AVATARS_PANEL_TEST_ID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_AVATAR_ITEM_TEST_ID('user1'))).toBeInTheDocument();
  });

  it('does not render avatars when assignees is empty', () => {
    renderAssignees(buildHit({ 'kibana.alert.workflow_assignee_ids': [] }));

    expect(screen.getByTestId(HEADER_ASSIGNEES_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId(USERS_AVATARS_PANEL_TEST_ID)).not.toBeInTheDocument();
    expect(screen.getByTestId(HEADER_ASSIGNEES_ADD_BUTTON_TEST_ID)).toBeInTheDocument();
  });

  it('renders empty state when privileges are loading', () => {
    mockUseAttacksPrivileges.mockReturnValue({
      hasIndexWrite: true,
      hasAttackIndexWrite: true,
      loading: true,
    });

    renderAssignees();

    expect(screen.getByTestId(HEADER_ASSIGNEES_EMPTY_TEST_ID)).toBeInTheDocument();
  });

  it('disables the add button for a remote/CCS index', () => {
    renderAssignees(buildHit({}, { _index: 'remote-cluster:.alerts-security.alerts-default' }));

    expect(screen.getByTestId(HEADER_ASSIGNEES_ADD_BUTTON_TEST_ID)).toBeDisabled();
  });

  it('does not crash when flattened._index is missing (reads from raw._index)', () => {
    const hit = {
      id: 'attack-123',
      raw: { _id: 'attack-123', _index: '.alerts-security.alerts-default' },
      flattened: {
        'kibana.alert.attack_discovery.alert_ids': ['alert-1'],
        'kibana.alert.workflow_assignee_ids': ['uid-1'],
      },
    } as unknown as DataTableRecord;

    renderAssignees(hit);

    expect(screen.getByTestId(HEADER_ASSIGNEES_ADD_BUTTON_TEST_ID)).not.toBeDisabled();
  });

  it('deduplicates alert ids from hit', () => {
    renderAssignees(
      buildHit({ 'kibana.alert.attack_discovery.alert_ids': ['alert-1', 'alert-1', 'alert-2'] })
    );

    expect(mockUseAttackAssigneesContextMenuItems).toHaveBeenCalledWith(
      expect.objectContaining({
        attacksWithAssignees: [
          expect.objectContaining({
            relatedAlertIds: ['alert-1', 'alert-2'],
          }),
        ],
      })
    );
  });
});
