/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';

import { basicCase } from '../../../containers/mock';
import { UserActionsList } from './user_actions_list';
import { renderWithTestingProviders } from '../../../common/mock';

const actionsHandlerMock = {
  loadingCommentIds: [],
  selectedOutlineCommentId: '',
  manageMarkdownEditIds: [],
  commentRefs: { current: {} },
  handleManageMarkdownEditId: jest.fn(),
  handleOutlineComment: jest.fn(),
  handleSaveComment: jest.fn(),
  handleDeleteComment: jest.fn(),
  handleManageQuote: jest.fn(),
  handleUpdate: jest.fn(),
};

const defaultProps = {
  comments: [] as React.ComponentProps<typeof UserActionsList>['comments'],
  commentRefs: { current: {} },
  handleManageQuote: jest.fn(),
  caseData: basicCase,
  userProfiles: new Map(),
  actionsHandler: actionsHandlerMock,
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ detailName: 'case-id' }),
}));

jest.mock('../../../common/lib/kibana');

describe('UserActionsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders list correctly', async () => {
    renderWithTestingProviders(<UserActionsList {...defaultProps} />);

    expect(await screen.findByTestId('user-actions-list')).toBeInTheDocument();
  });

  it('renders provided comments', async () => {
    const comments = [
      {
        username: 'elastic',
        children: <div data-test-subj="test-comment">{'Test comment'}</div>,
      },
    ];

    renderWithTestingProviders(<UserActionsList {...defaultProps} comments={comments} />);

    expect(await screen.findByTestId('test-comment')).toBeInTheDocument();
  });
});
