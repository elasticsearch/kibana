/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { appendSearch } from './helpers';

export const getDetectionEngineUrl = (search?: string) => `${appendSearch(search)}`;

export const getRulesUrl = (search?: string) => `${appendSearch(search)}`;

export const getRuleDetailsUrl = (detailName: string, search?: string) =>
  `/id/${encodeURIComponent(detailName)}${appendSearch(search)}`;

export const getRuleDetailsTabUrl = (detailName: string, tabName: string, search?: string) =>
  `/id/${encodeURIComponent(detailName)}/${tabName}${appendSearch(search)}`;

export const getEditRuleUrl = (detailName: string, search?: string) =>
  `/id/${encodeURIComponent(detailName)}/edit${appendSearch(search)}`;

export const getRuleChangesHistoryUrl = (ruleId: string, search?: string) =>
  `/id/${encodeURIComponent(ruleId)}/changes-history${appendSearch(search)}`;
