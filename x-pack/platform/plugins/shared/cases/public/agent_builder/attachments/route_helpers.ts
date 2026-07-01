/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart } from '@kbn/core-application-browser';
import { GENERAL_CASES_OWNER, OWNER_INFO } from '../../../common/constants';
import type { CaseAttachmentData } from '../../../common/types/agent_builder/attachment_schemas';
import { CASE_VIEW_PAGE_TABS } from '../../../common/types';

const getOwnerInfo = (owner: string) => {
  const info = (OWNER_INFO as Record<string, { appId: string; casesBasePath: string }>)[owner];
  return info ?? OWNER_INFO[GENERAL_CASES_OWNER];
};

export const getAppIdForOwner = (owner: string): string => getOwnerInfo(owner).appId;

const getCasesBasePath = (owner: string): string => getOwnerInfo(owner).casesBasePath;

const getCasePathForOwner = (owner: string, caseId: string): string =>
  `${getCasesBasePath(owner)}/${caseId}`;

export const getCasesListPathForOwner = (owner: string, query?: string): string => {
  const base = getCasesBasePath(owner);
  return query ? `${base}?${query}` : base;
};

const getCaseTabPathForOwner = (
  owner: string,
  caseId: string,
  tabId: CASE_VIEW_PAGE_TABS
): string => {
  const base = getCasePathForOwner(owner, caseId);
  return `${base}/?tabId=${tabId}`;
};

export const getCaseUrls = ({
  application,
  data,
}: {
  data: CaseAttachmentData;
  application: ApplicationStart;
}) => ({
  case: application.getUrlForApp(getAppIdForOwner(data.owner), {
    path: getCasePathForOwner(data.owner, data.id),
  }),
  activityTab: application.getUrlForApp(getAppIdForOwner(data.owner), {
    path: getCaseTabPathForOwner(data.owner, data.id, CASE_VIEW_PAGE_TABS.ACTIVITY),
  }),
  alertsTab: application.getUrlForApp(getAppIdForOwner(data.owner), {
    path: getCaseTabPathForOwner(data.owner, data.id, CASE_VIEW_PAGE_TABS.ALERTS),
  }),
  attachmentsTab: application.getUrlForApp(getAppIdForOwner(data.owner), {
    path: getCaseTabPathForOwner(data.owner, data.id, CASE_VIEW_PAGE_TABS.ATTACHMENTS),
  }),
});
