/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UserProfileService } from '../../services';
import { getConnectorsRoute } from './internal/get_connectors';
import { getCaseUserActionStatsRoute } from './internal/get_case_user_actions_stats';
import { bulkCreateAttachmentsRoute } from './internal/bulk_create_attachments';
import { bulkGetCasesRoute } from './internal/bulk_get_cases';
import { suggestUserProfilesRoute } from './internal/suggest_user_profiles';
import type { CaseRoute } from './types';
import { bulkGetAttachmentsRoute } from './internal/bulk_get_attachments';
import { getCaseUsersRoute } from './internal/get_case_users';
import { bulkDeleteFileAttachments } from './internal/bulk_delete_file_attachments';
import { getCategoriesRoute } from './cases/categories/get_categories';
import { getCaseMetricRoute } from './internal/get_case_metrics';
import { getCasesMetricRoute } from './internal/get_cases_metrics';
import { searchCasesRoute } from './internal/search_cases';
import { replaceCustomFieldRoute } from './internal/replace_custom_field';
import { postObservableRoute } from './observables/post_observable';
import { similarCaseRoute } from './cases/similar';
import { patchObservableRoute } from './observables/patch_observable';
import { deleteObservableRoute } from './observables/delete_observable';
import { findUserActionsRoute } from './internal/find_user_actions';
import { findCasesContainingAllDocumentsRoute } from './internal/find_cases_containing_all_documents';
import type { ConfigType } from '../../config';
import { getTemplateRoutes } from './templates';
import { getFieldDefinitionRoutes } from './field_definitions';

export const getInternalRoutes = (userProfileService: UserProfileService, config: ConfigType) =>
  [
    bulkCreateAttachmentsRoute,
    suggestUserProfilesRoute(userProfileService),
    getConnectorsRoute,
    bulkGetCasesRoute,
    getCaseUserActionStatsRoute,
    bulkGetAttachmentsRoute,
    getCaseUsersRoute,
    bulkDeleteFileAttachments,
    getCategoriesRoute,
    getCaseMetricRoute,
    getCasesMetricRoute,
    searchCasesRoute,
    replaceCustomFieldRoute,
    postObservableRoute,
    patchObservableRoute,
    deleteObservableRoute,
    similarCaseRoute,
    findUserActionsRoute,
    findCasesContainingAllDocumentsRoute,
    ...getTemplateRoutes(config),
    ...getFieldDefinitionRoutes(config),
  ] as CaseRoute[];
