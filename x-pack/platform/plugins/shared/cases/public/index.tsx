/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext } from '@kbn/core/public';
import { CasesUiPlugin } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new CasesUiPlugin(initializerContext);
}

export { DRAFT_COMMENT_STORAGE_ID } from './components/markdown_editor/plugins/lens/constants';

export type { CasesPublicStart, CasesPublicSetup } from './types';
export type { GetCreateCaseFlyoutProps } from './client/ui/get_create_case_flyout';
export type { GetAllCasesSelectorModalProps } from './client/ui/get_all_cases_selector_modal';
export type { GetRecentCasesProps } from './client/ui/get_recent_cases';

export type { CaseAttachments, CaseAttachmentsWithoutOwner } from './types';

export type { ICasesDeepLinkId } from './common/navigation';
export {
  getCasesDeepLinks,
  CasesDeepLinkId,
  generateCaseViewPath,
  useCaseViewNavigation,
  useCaseViewParams,
} from './common/navigation';
export type {
  RegisteredUnifiedAttachmentType,
  UnifiedHybridAttachmentType,
  UnifiedReferenceAttachmentType,
  UnifiedValueAttachmentType,
  CommonAttachmentListViewProps,
  UnifiedHybridAttachmentViewProps,
  UnifiedReferenceAttachmentViewProps,
  UnifiedValueAttachmentViewProps,
} from './client/attachment_framework/types';
export { AttachmentActionType, defineAttachment } from './client/attachment_framework/types';
export { useCasesContext } from './components/cases_context/use_cases_context';
export { useRefreshCaseViewPage } from './components/case_view/use_on_refresh_case_view_page';
export { ShowTableButton } from './components/attachments/common/show_table_button';
export type {
  CasesTimelineIntegration,
  SelectTimelineModalProps,
} from './components/timeline_context';
