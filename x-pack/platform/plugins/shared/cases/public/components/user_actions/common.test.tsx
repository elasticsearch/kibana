/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCommentList } from '@elastic/eui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import copy from 'copy-to-clipboard';
import { AttachmentActionType } from '../../client/attachment_framework/types';
import { renderAttachmentAction } from './attachment_action';

import { UserActionActions } from '../../../common/types/domain';
import { createCommonUpdateUserActionBuilder } from './common';
import { getUserAction } from '../../containers/mock';
import { TestProviders } from '../../common/mock';
import { userProfiles, userProfilesMap } from '../../containers/user_profiles/api.mock';

jest.mock('../../common/lib/kibana');
jest.mock('../../common/navigation/hooks');
jest.mock('copy-to-clipboard', () => jest.fn());

describe('createCommonUpdateUserActionBuilder ', () => {
  const label = <>{'A label'}</>;
  const handleOutlineComment = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', async () => {
    const userAction = getUserAction('title', UserActionActions.update, {
      createdBy: { profileUid: userProfiles[0].uid },
    });
    const builder = createCommonUpdateUserActionBuilder({
      userProfiles: userProfilesMap,
      userAction,
      label,
      icon: 'dot',
      handleOutlineComment,
    });

    const createdUserAction = builder.build();
    render(
      <TestProviders>
        <EuiCommentList comments={createdUserAction} />
      </TestProviders>
    );

    // The avatar
    expect(screen.getByText('DR')).toBeInTheDocument();
    // The username
    expect(screen.getByText(userProfiles[0].user.full_name!)).toBeInTheDocument();
    // The label of the event
    expect(screen.getByText('A label')).toBeInTheDocument();
    // The copy link button
    expect(screen.getByLabelText('Copy reference link')).toBeInTheDocument();
  });

  it('renders shows the move to comment button if the user action is an edit comment', async () => {
    const userAction = getUserAction('comment', UserActionActions.update);
    const builder = createCommonUpdateUserActionBuilder({
      userProfiles: userProfilesMap,
      userAction,
      label,
      icon: 'dot',
      handleOutlineComment,
    });

    const createdUserAction = builder.build();
    render(
      <TestProviders>
        <EuiCommentList comments={createdUserAction} />
      </TestProviders>
    );

    expect(screen.getByLabelText('Highlight the referenced comment')).toBeInTheDocument();
  });

  it('it copies the reference link when clicking the reference button', async () => {
    const userAction = getUserAction('comment', UserActionActions.update);
    const builder = createCommonUpdateUserActionBuilder({
      userProfiles: userProfilesMap,
      userAction,
      label,
      icon: 'dot',
      handleOutlineComment,
    });

    const createdUserAction = builder.build();
    render(
      <TestProviders>
        <EuiCommentList comments={createdUserAction} />
      </TestProviders>
    );

    await userEvent.click(screen.getByLabelText('Copy reference link'));
    expect(copy).toHaveBeenCalled();
  });

  it('calls the handleOutlineComment when clicking the reference button', async () => {
    const userAction = getUserAction('comment', UserActionActions.update);
    const builder = createCommonUpdateUserActionBuilder({
      userProfiles: userProfilesMap,
      userAction,
      label,
      icon: 'dot',
      handleOutlineComment,
    });

    const createdUserAction = builder.build();
    render(
      <TestProviders>
        <EuiCommentList comments={createdUserAction} />
      </TestProviders>
    );

    await userEvent.click(screen.getByLabelText('Highlight the referenced comment'));
    expect(handleOutlineComment).toHaveBeenCalled();
  });

  it('renders the documentAction after the copy-link button when provided', () => {
    const userAction = getUserAction('title', UserActionActions.update, {
      createdBy: { profileUid: userProfiles[0].uid },
    });
    const builder = createCommonUpdateUserActionBuilder({
      userProfiles: userProfilesMap,
      userAction,
      label,
      icon: 'dot',
      handleOutlineComment,
      documentAction: (
        <button type="button" data-test-subj="doc-action-btn">
          {'Open document'}
        </button>
      ),
    });

    render(
      <TestProviders>
        <EuiCommentList comments={builder.build()} />
      </TestProviders>
    );

    expect(screen.getByTestId('doc-action-btn')).toBeInTheDocument();
    // Copy link still present
    expect(screen.getByLabelText('Copy reference link')).toBeInTheDocument();
  });

  it('does not render the documentAction slot when not provided', () => {
    const userAction = getUserAction('title', UserActionActions.update, {
      createdBy: { profileUid: userProfiles[0].uid },
    });
    const builder = createCommonUpdateUserActionBuilder({
      userProfiles: userProfilesMap,
      userAction,
      label,
      icon: 'dot',
      handleOutlineComment,
    });

    render(
      <TestProviders>
        <EuiCommentList comments={builder.build()} />
      </TestProviders>
    );

    expect(screen.queryByTestId('doc-action-btn')).not.toBeInTheDocument();
    // Copy link still present without the extra action
    expect(screen.getByLabelText('Copy reference link')).toBeInTheDocument();
  });

  it('renders a BUTTON-typed document action alongside the copy-link button', () => {
    // `renderAttachmentAction` returns an `EuiFlexItem` for BUTTON actions. Passing it directly
    // as `documentAction` must render the action button and keep the copy-link button.
    const userAction = getUserAction('title', UserActionActions.update, {
      createdBy: { profileUid: userProfiles[0].uid },
    });
    const builder = createCommonUpdateUserActionBuilder({
      userProfiles: userProfilesMap,
      userAction,
      label,
      icon: 'dot',
      handleOutlineComment,
      documentAction: renderAttachmentAction(
        {
          type: AttachmentActionType.BUTTON,
          label: 'Open alert',
          iconType: 'popout',
          onClick: jest.fn(),
        },
        'doc-action-test-subj'
      ),
    });

    render(
      <TestProviders>
        <EuiCommentList comments={builder.build()} />
      </TestProviders>
    );

    // The BUTTON action renders as an aria-labelled button.
    expect(screen.getByLabelText('Open alert')).toBeInTheDocument();
    // Copy link still present alongside the document action.
    expect(screen.getByLabelText('Copy reference link')).toBeInTheDocument();
  });
});
