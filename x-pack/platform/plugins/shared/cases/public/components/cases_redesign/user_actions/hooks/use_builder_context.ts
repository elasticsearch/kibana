/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useEuiTheme } from '@elastic/eui';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';

import type { CaseConnectors, CaseUI, CasesConfigurationUI } from '../../../../containers/types';
import type { CurrentUserProfile } from '../../../types';
import { useCasesContext } from '../../../cases_context/use_cases_context';

interface UseBuilderContextArgs {
  caseData: CaseUI;
  casesConfiguration: CasesConfigurationUI;
  caseConnectors: CaseConnectors;
  userProfiles: Map<string, UserProfileWithAvatar>;
  currentUserProfile: CurrentUserProfile;
  manageMarkdownEditIds: string[];
  selectedOutlineCommentId: string;
  loadingCommentIds: string[];
  handleOutlineComment: (id: string) => void;
  handleDeleteComment: (id: string, successToasterTitle: string) => void;
}

export const useBuilderContext = ({
  caseData,
  casesConfiguration,
  caseConnectors,
  userProfiles,
  currentUserProfile,
  manageMarkdownEditIds,
  selectedOutlineCommentId,
  loadingCommentIds,
  handleOutlineComment,
  handleDeleteComment,
}: UseBuilderContextArgs) => {
  const { euiTheme } = useEuiTheme();
  const {
    externalReferenceAttachmentTypeRegistry,
    persistableStateAttachmentTypeRegistry,
    unifiedAttachmentTypeRegistry,
    owner,
  } = useCasesContext();

  return useMemo(
    () => ({
      appId: owner[0] ?? '',
      caseData,
      casesConfiguration,
      caseConnectors,
      userProfiles,
      currentUserProfile,
      externalReferenceAttachmentTypeRegistry,
      persistableStateAttachmentTypeRegistry,
      unifiedAttachmentTypeRegistry,
      manageMarkdownEditIds,
      selectedOutlineCommentId,
      loadingCommentIds,
      euiTheme,
      handleOutlineComment,
      handleDeleteComment,
    }),
    [
      owner,
      caseData,
      casesConfiguration,
      caseConnectors,
      userProfiles,
      currentUserProfile,
      externalReferenceAttachmentTypeRegistry,
      persistableStateAttachmentTypeRegistry,
      unifiedAttachmentTypeRegistry,
      manageMarkdownEditIds,
      selectedOutlineCommentId,
      loadingCommentIds,
      euiTheme,
      handleOutlineComment,
      handleDeleteComment,
    ]
  );
};
