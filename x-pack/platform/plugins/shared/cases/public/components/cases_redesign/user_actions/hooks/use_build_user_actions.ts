/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { EuiCommentProps, EuiThemeComputed } from '@elastic/eui';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';

import type {
  AttachmentUIV2,
  UserActionUI,
  CasesConfigurationUI,
  CaseUI,
  CaseConnectors,
} from '../../../../containers/types';
import type { CurrentUserProfile } from '../../../types';
import type { ExternalReferenceAttachmentTypeRegistry } from '../../../../client/attachment_framework/external_reference_registry';
import type { PersistableStateAttachmentTypeRegistry } from '../../../../client/attachment_framework/persistable_state_registry';
import type { UnifiedAttachmentTypeRegistry } from '../../../../client/attachment_framework/unified_attachment_registry';
import { isUserActionTypeSupported } from '../../../user_actions/helpers';
import { builderMap } from '../../../user_actions/builder';

interface UseBuildUserActionsArgs {
  caseUserActions: UserActionUI[];
  attachments: AttachmentUIV2[];
  caseData: CaseUI;
  casesConfiguration: CasesConfigurationUI;
  caseConnectors: CaseConnectors;
  userProfiles: Map<string, UserProfileWithAvatar>;
  currentUserProfile: CurrentUserProfile;
  appId: string;
  externalReferenceAttachmentTypeRegistry: ExternalReferenceAttachmentTypeRegistry;
  persistableStateAttachmentTypeRegistry: PersistableStateAttachmentTypeRegistry;
  unifiedAttachmentTypeRegistry: UnifiedAttachmentTypeRegistry;
  manageMarkdownEditIds: string[];
  selectedOutlineCommentId: string;
  loadingCommentIds: string[];
  euiTheme: EuiThemeComputed<{}>;
  handleOutlineComment: (id: string) => void;
  handleDeleteComment: (id: string, successToasterTitle: string) => void;
}

export const useBuildUserActions = ({
  caseUserActions,
  attachments,
  caseData,
  casesConfiguration,
  caseConnectors,
  userProfiles,
  currentUserProfile,
  appId,
  externalReferenceAttachmentTypeRegistry,
  persistableStateAttachmentTypeRegistry,
  unifiedAttachmentTypeRegistry,
  manageMarkdownEditIds,
  selectedOutlineCommentId,
  loadingCommentIds,
  euiTheme,
  handleOutlineComment,
  handleDeleteComment,
}: UseBuildUserActionsArgs): EuiCommentProps[] => {
  return useMemo(() => {
    if (!caseUserActions) {
      return [];
    }

    return caseUserActions.reduce<EuiCommentProps[]>((userActions, userAction, index) => {
      if (!isUserActionTypeSupported(userAction.type)) {
        return userActions;
      }

      const builder = builderMap[userAction.type];

      if (builder == null) {
        return userActions;
      }

      const userActionBuilder = builder({
        appId,
        caseData,
        casesConfiguration,
        caseConnectors,
        externalReferenceAttachmentTypeRegistry,
        persistableStateAttachmentTypeRegistry,
        unifiedAttachmentTypeRegistry,
        userAction,
        userProfiles,
        currentUserProfile,
        attachments,
        index,
        manageMarkdownEditIds,
        selectedOutlineCommentId,
        loadingCommentIds,
        euiTheme,
        handleOutlineComment,
        handleDeleteComment,
      });
      return [...userActions, ...userActionBuilder.build()];
    }, []);
  }, [
    caseUserActions,
    appId,
    caseData,
    casesConfiguration,
    caseConnectors,
    externalReferenceAttachmentTypeRegistry,
    persistableStateAttachmentTypeRegistry,
    unifiedAttachmentTypeRegistry,
    userProfiles,
    currentUserProfile,
    attachments,
    manageMarkdownEditIds,
    selectedOutlineCommentId,
    loadingCommentIds,
    euiTheme,
    handleOutlineComment,
    handleDeleteComment,
  ]);
};
