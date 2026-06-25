/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import type { EuiThemeComputed } from '@elastic/eui';

import { useBuildUserActions } from './use_build_user_actions';
import { builderMap } from '../../../user_actions/builder';
import { basicCase, getUserAction } from '../../../../containers/mock';
import { casesConfigurationsMock } from '../../../../containers/configure/mock';
import { getCaseConnectorsMockResponse } from '../../../../common/mock/connectors';
import { ExternalReferenceAttachmentTypeRegistry } from '../../../../client/attachment_framework/external_reference_registry';
import { PersistableStateAttachmentTypeRegistry } from '../../../../client/attachment_framework/persistable_state_registry';
import { UnifiedAttachmentTypeRegistry } from '../../../../client/attachment_framework/unified_attachment_registry';
import { UserActionTypes } from '../../../../../common/types/domain';

jest.mock('../../../user_actions/builder');

const builderMapMock = jest.mocked(builderMap);

const defaultArgs = {
  caseUserActions: [],
  attachments: [],
  caseData: basicCase,
  casesConfiguration: casesConfigurationsMock,
  caseConnectors: getCaseConnectorsMockResponse(),
  userProfiles: new Map(),
  currentUserProfile: undefined,
  appId: 'securitySolution',
  externalReferenceAttachmentTypeRegistry: new ExternalReferenceAttachmentTypeRegistry(),
  persistableStateAttachmentTypeRegistry: new PersistableStateAttachmentTypeRegistry(),
  unifiedAttachmentTypeRegistry: new UnifiedAttachmentTypeRegistry(),
  manageMarkdownEditIds: [],
  selectedOutlineCommentId: '',
  loadingCommentIds: [],
  euiTheme: {} as EuiThemeComputed<{}>,
  handleOutlineComment: jest.fn(),
  handleDeleteComment: jest.fn(),
};

describe('useBuildUserActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when caseUserActions is empty', () => {
    const { result } = renderHook(() => useBuildUserActions(defaultArgs));

    expect(result.current).toEqual([]);
  });

  it('skips unsupported user action types', () => {
    const unsupportedAction = getUserAction(UserActionTypes.delete_case, 'delete');

    const { result } = renderHook(() =>
      useBuildUserActions({ ...defaultArgs, caseUserActions: [unsupportedAction] })
    );

    expect(result.current).toEqual([]);
  });

  it('builds comment props from supported user actions', () => {
    const commentAction = getUserAction(UserActionTypes.comment, 'create');
    const mockBuiltComment = { username: 'elastic', children: null };
    const buildMock = jest.fn().mockReturnValue([mockBuiltComment]);

    builderMapMock.comment.mockReturnValue({ build: buildMock });

    const { result } = renderHook(() =>
      useBuildUserActions({ ...defaultArgs, caseUserActions: [commentAction] })
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toEqual(mockBuiltComment);
    expect(builderMapMock.comment).toHaveBeenCalled();
  });

  it('accumulates results from multiple user actions', () => {
    const action1 = getUserAction(UserActionTypes.comment, 'create');
    const action2 = getUserAction(UserActionTypes.title, 'update');

    const buildMock1 = jest.fn().mockReturnValue([{ username: 'user1' }]);
    const buildMock2 = jest.fn().mockReturnValue([{ username: 'user2' }]);

    builderMapMock.comment.mockReturnValue({ build: buildMock1 });
    builderMapMock.title.mockReturnValue({ build: buildMock2 });

    const { result } = renderHook(() =>
      useBuildUserActions({ ...defaultArgs, caseUserActions: [action1, action2] })
    );

    expect(result.current).toHaveLength(2);
  });
});
