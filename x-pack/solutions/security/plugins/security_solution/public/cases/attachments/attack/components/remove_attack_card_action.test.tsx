/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import type { UnifiedReferenceAttachmentViewProps } from '@kbn/cases-plugin/public/client/attachment_framework/types';
import {
  AttachmentActionType,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import type { AttackAttachmentPayload } from '../../../../../common/cases/attachments/attack';
import {
  ATTACK_CARD_DELETE_ACTION_TEST_ID,
  REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID,
  REMOVE_ATTACK_ALERTS_EXPLANATION_TEST_ID,
  REMOVE_ATTACK_MODAL_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';
import { TestProviders } from '../../../../common/mock/test_providers';
import { useKibana as mockUseKibana } from '../../../../common/lib/kibana/__mocks__';
import { allCasesPermissions, noCasesPermissions } from '../../../../cases_test_utils';
import { useFindAttackDiscoveries } from '../../../../attack_discovery/pages/use_find_attack_discoveries';
import { useAssistantAvailability } from '../../../../assistant/use_assistant_availability';
import { getAttackAttachment } from '..';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../attack_discovery/pages/use_find_attack_discoveries');
jest.mock('../../../../assistant/use_assistant_availability');
jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: () => ({ openFlyout: jest.fn() }),
}));
jest.mock('../../../../flyout_v2/use_flyout_api', () => ({
  useFlyoutApi: () => ({ openAttackFlyout: jest.fn() }),
}));
jest.mock('../../../../common/hooks/use_is_new_flyout_enabled', () => ({
  useIsNewFlyoutEnabled: () => true,
}));

const RESOLVE_CASE_URL = '/api/cases/case-1/resolve';
const BULK_DELETE_URL = '/api/cases/case-1/comments/_bulk_delete';

const useFindAttackDiscoveriesMock = useFindAttackDiscoveries as jest.Mock;
const useAssistantAvailabilityMock = useAssistantAvailability as jest.Mock;
const mockedUseKibana = mockUseKibana();

type Props = UnifiedReferenceAttachmentViewProps<AttackAttachmentPayload['metadata']>;

const buildProps = (overrides: Partial<Props> = {}) =>
  ({
    caseData: { id: 'case-1', title: 'Case 1' },
    permissions: allCasesPermissions(),
    savedObjectId: 'so-attack-1',
    attachmentId: 'attack-1',
    metadata: {
      title: 'Credential dumping on host-1',
      alertCount: 2,
      index: '.alerts-security.attack.discovery.alerts-default',
    },
    ...overrides,
  } as unknown as Props);

const foundAttachment = (overrides: Record<string, unknown> = {}) => ({
  id: 'so-attack-1',
  version: 'WzEsMV0=',
  type: SECURITY_ATTACK_ATTACHMENT_TYPE,
  owner: 'securitySolution',
  attachmentId: 'attack-1',
  metadata: { title: 'Credential dumping on host-1', alertCount: 2, index: '.alerts-attack' },
  created_at: '2024-05-02T10:00:00.000Z',
  created_by: { email: null, full_name: 'Ada Lovelace', username: 'ada' },
  pushed_at: null,
  pushed_by: null,
  updated_at: null,
  updated_by: null,
  ...overrides,
});

/**
 * The case holds two attacks. `alert-shared` belongs to both, so removing `attack-1` may only
 * take `so-alert-1` — the attachment covering the alert nothing else claims.
 */
const caseAttachments = [
  foundAttachment(),
  foundAttachment({ id: 'so-attack-2', attachmentId: 'attack-2' }),
  foundAttachment({
    id: 'so-alert-1',
    type: SECURITY_ALERT_ATTACHMENT_TYPE,
    attachmentId: ['alert-only-mine'],
    metadata: { index: '.alerts-detections' },
  }),
  foundAttachment({
    id: 'so-alert-2',
    type: SECURITY_ALERT_ATTACHMENT_TYPE,
    attachmentId: ['alert-shared'],
    metadata: { index: '.alerts-detections' },
  }),
];

const renderDeleteAction = (props: Props = buildProps()) => {
  const actions = getAttackAttachment().getCreationActivity(props).getActions?.(props) ?? [];
  const deleteAction = actions[1];

  return render(
    <TestProviders>
      {deleteAction?.type === AttachmentActionType.CUSTOM ? deleteAction.render() : null}
    </TestProviders>
  );
};

const deleteButton = () => screen.findByTestId(`${ATTACK_CARD_DELETE_ACTION_TEST_ID}-so-attack-1`);

let user: UserEvent;

describe('the attack activity card delete action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    useAssistantAvailabilityMock.mockReturnValue({ isAssistantEnabled: true });
    useFindAttackDiscoveriesMock.mockReturnValue({
      data: {
        data: [
          { id: 'attack-1', alertIds: ['alert-only-mine', 'alert-shared'], replacements: {} },
          { id: 'attack-2', alertIds: ['alert-shared'], replacements: {} },
        ],
      },
      isLoading: false,
      status: 'success',
      error: undefined,
      cancelRequest: jest.fn(),
      refetch: jest.fn(),
    });
    mockedUseKibana.services.http.get = jest
      .fn()
      .mockResolvedValue({ case: { comments: caseAttachments } });
    mockedUseKibana.services.http.post = jest.fn().mockResolvedValue(undefined);
  });

  it('is registered only for a user who may delete attachments', () => {
    const readOnlyProps = buildProps({ permissions: noCasesPermissions() });
    const actions =
      getAttackAttachment().getCreationActivity(readOnlyProps).getActions?.(readOnlyProps) ?? [];

    expect(actions).toHaveLength(1);
  });

  it('issues no request when the activity card renders it', async () => {
    renderDeleteAction();

    expect(await deleteButton()).toBeInTheDocument();
    expect(mockedUseKibana.services.http.get).not.toHaveBeenCalled();
    expect(useFindAttackDiscoveriesMock).not.toHaveBeenCalled();
  });

  it('fetches the case attachments only once the delete action is opened', async () => {
    renderDeleteAction();

    await user.click(await deleteButton());

    expect(await screen.findByTestId(REMOVE_ATTACK_MODAL_TEST_ID)).toBeInTheDocument();
    await waitFor(() =>
      expect(mockedUseKibana.services.http.get).toHaveBeenCalledWith(RESOLVE_CASE_URL, {
        query: { includeComments: true, mode: 'unified' },
        signal: expect.anything(),
      })
    );
  });

  it('offers the attack’s unshared alerts, already ticked', async () => {
    renderDeleteAction();

    await user.click(await deleteButton());

    const checkbox = await screen.findByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID);
    expect(checkbox).toBeChecked();
    // One alert, not two: `alert-shared` still belongs to the other attack on the case.
    expect(screen.getByLabelText('Also remove 1 related alert')).toBe(checkbox);
  });

  it('removes the attack and the alerts no other attack claims in one request', async () => {
    renderDeleteAction();

    await user.click(await deleteButton());
    await screen.findByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID);
    await user.click(screen.getByText('Remove'));

    await waitFor(() => expect(mockedUseKibana.services.http.post).toHaveBeenCalledTimes(1));
    expect(mockedUseKibana.services.http.post).toHaveBeenCalledWith(BULK_DELETE_URL, {
      body: JSON.stringify({ ids: ['so-attack-1', 'so-alert-1'] }),
      signal: undefined,
    });
  });

  it('removes the attack on its own when the related alerts are unticked', async () => {
    renderDeleteAction();

    await user.click(await deleteButton());
    await user.click(await screen.findByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID));
    await user.click(screen.getByText('Remove'));

    await waitFor(() => expect(mockedUseKibana.services.http.post).toHaveBeenCalledTimes(1));
    expect(mockedUseKibana.services.http.post).toHaveBeenCalledWith(BULK_DELETE_URL, {
      body: JSON.stringify({ ids: ['so-attack-1'] }),
      signal: undefined,
    });
  });

  it('removes nothing when the prompt is cancelled', async () => {
    renderDeleteAction();

    await user.click(await deleteButton());
    await user.click(await screen.findByText('Cancel'));

    expect(screen.queryByTestId(REMOVE_ATTACK_MODAL_TEST_ID)).not.toBeInTheDocument();
    expect(mockedUseKibana.services.http.post).not.toHaveBeenCalled();
  });

  it('explains itself instead of guessing when the attachments cannot be fetched', async () => {
    mockedUseKibana.services.http.get = jest.fn().mockRejectedValue(new Error('boom'));
    renderDeleteAction();

    await user.click(await deleteButton());

    expect(await screen.findByTestId(REMOVE_ATTACK_ALERTS_EXPLANATION_TEST_ID)).toHaveTextContent(
      'could not be determined'
    );
    expect(screen.getByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID)).toBeDisabled();
  });

  it('is operable by keyboard', async () => {
    renderDeleteAction();

    const button = await deleteButton();
    await user.tab();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(await screen.findByTestId(REMOVE_ATTACK_MODAL_TEST_ID)).toBeInTheDocument();
  });
});
