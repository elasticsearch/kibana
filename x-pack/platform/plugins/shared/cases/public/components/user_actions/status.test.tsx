/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCommentList } from '@elastic/eui';
import { render, screen } from '@testing-library/react';

import { CaseStatuses, UserActionActions } from '../../../common/types/domain';
import { getUserAction } from '../../containers/mock';
import { TestProviders } from '../../common/mock';
import { createStatusUserActionBuilder } from './status';
import { getMockBuilderArgs } from './mock';

jest.mock('../../common/lib/kibana');
jest.mock('../../common/navigation/hooks');

describe('createStatusUserActionBuilder ', () => {
  const builderArgs = getMockBuilderArgs();
  const tests = [
    [CaseStatuses.open, 'Open'],
    [CaseStatuses['in-progress'], 'In progress'],
    [CaseStatuses.closed, 'Closed'],
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(tests)('renders correctly when changed to %s status', async (status, label) => {
    const userAction = getUserAction('status', UserActionActions.update, { payload: { status } });
    const builder = createStatusUserActionBuilder({
      ...builderArgs,
      userAction,
    });

    const createdUserAction = builder.build();
    render(
      <TestProviders>
        <EuiCommentList comments={createdUserAction} />
      </TestProviders>
    );

    expect(screen.getByTestId('status-update-user-action-status-title')).toBeInTheDocument();
    expect(screen.getByText('marked case as')).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders close reason details when provided by status user action', () => {
    const userAction = getUserAction('status', UserActionActions.update, {
      payload: { status: CaseStatuses.closed, closeReason: 'false_positive', syncedAlertCount: 2 },
    });
    const builder = createStatusUserActionBuilder({
      ...builderArgs,
      userAction,
    });

    const createdUserAction = builder.build();
    render(
      <TestProviders>
        <EuiCommentList comments={createdUserAction} />
      </TestProviders>
    );

    expect(screen.getByText('and synced 2 detections with close reason')).toBeInTheDocument();
    expect(screen.getByText('False Positive')).toBeInTheDocument();
    expect(screen.getByTestId('status-update-user-action-close-reason-badge')).toBeInTheDocument();
  });

  it('does not render sync details when only close reason is present', () => {
    const userAction = getUserAction('status', UserActionActions.update, {
      payload: { status: CaseStatuses.closed, closeReason: 'false_positive' },
    });
    const builder = createStatusUserActionBuilder({
      ...builderArgs,
      userAction,
    });

    const createdUserAction = builder.build();
    render(
      <TestProviders>
        <EuiCommentList comments={createdUserAction} />
      </TestProviders>
    );

    expect(screen.queryByText('and synced 1 detection with close reason')).not.toBeInTheDocument();
    expect(screen.queryByText('False Positive')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('status-update-user-action-close-reason-badge')
    ).not.toBeInTheDocument();
  });

  it('renders custom close reason values as-is', () => {
    const userAction = getUserAction('status', UserActionActions.update, {
      payload: {
        status: CaseStatuses.closed,
        closeReason: 'my custom reason',
        syncedAlertCount: 1,
      },
    });
    const builder = createStatusUserActionBuilder({
      ...builderArgs,
      userAction,
    });

    const createdUserAction = builder.build();
    render(
      <TestProviders>
        <EuiCommentList comments={createdUserAction} />
      </TestProviders>
    );

    expect(screen.getByText('and synced 1 detection with close reason')).toBeInTheDocument();
    expect(screen.getByText('my custom reason')).toBeInTheDocument();
  });
});
