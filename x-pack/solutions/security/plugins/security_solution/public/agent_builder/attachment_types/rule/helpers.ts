/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type { RuleResponse } from '../../../../common/api/detection_engine/model/rule_schema';
import { RULES_PATH } from '../../../../common/constants';
import {
  ML_TYPE_DESCRIPTION,
  EQL_TYPE_DESCRIPTION,
  QUERY_TYPE_DESCRIPTION,
  THRESHOLD_TYPE_DESCRIPTION,
  THREAT_MATCH_TYPE_DESCRIPTION,
  NEW_TERMS_TYPE_DESCRIPTION,
  ESQL_TYPE_DESCRIPTION,
  QUERY_LABEL,
  EQL_QUERY_LABEL,
  ESQL_QUERY_LABEL,
  SAVED_QUERY_LABEL,
} from './translations';

export type RuleAttachmentIntent = 'create' | 'update';

export type RuleAttachment = Attachment<
  string,
  {
    text: string;
    attachmentLabel?: string;
  }
>;

export const isOnRuleFormPage = (pathname: string): boolean =>
  pathname.includes(RULES_PATH) && (pathname.includes('/create') || pathname.includes('/edit'));

/** Rule id encoded in a rule edit URL (`…/rules/id/<ruleId>/edit`). */
export const getRuleIdFromEditFormPath = (pathname: string): string | undefined => {
  if (!pathname.includes(RULES_PATH) || !pathname.includes('/edit')) {
    return undefined;
  }
  const match = pathname.match(/\/id\/([^/]+)\/edit/);
  return match ? decodeURIComponent(match[1]) : undefined;
};

/**
 * True when the open create/edit form is already showing this saved rule (same id in the URL).
 * Used to hide redundant "View rule" — not when the form is for a different rule.
 */
export const isAttachmentRuleOpenOnFormPage = (
  attachmentRuleId: string | undefined,
  pathname: string
): boolean => {
  if (!attachmentRuleId || !isOnRuleFormPage(pathname)) {
    return false;
  }
  if (pathname.includes('/create')) {
    return false;
  }
  const formRuleId = getRuleIdFromEditFormPath(pathname);
  return formRuleId !== undefined && formRuleId === attachmentRuleId;
};

/** True when the user is already viewing the details page for this specific rule. */
const isOnRuleDetailsPage = (ruleId: string, pathname: string): boolean => {
  if (!pathname.includes(RULES_PATH)) return false;
  const match = pathname.match(/\/id\/([^/]+)/);
  if (!match) return false;
  const pathRuleId = decodeURIComponent(match[1]);
  return pathRuleId === ruleId && !pathname.includes('/edit');
};

/** Whether "View rule" should appear for an update-intent attachment with this rule id. */
export const shouldShowViewRuleButton = (
  attachmentRuleId: string | undefined,
  pathname: string
): boolean => {
  if (!attachmentRuleId) {
    return false;
  }
  return !isOnRuleDetailsPage(attachmentRuleId, pathname);
};

/**
 * Saved-rule id from the attachment. Lives in the attachment's top-level `origin` (set after save
 * and persisted server-side), the single source of truth — used for navigation and the save target.
 */
export const getRuleIdFromAttachment = (attachment: RuleAttachment): string | undefined =>
  attachment.origin ?? undefined;

/**
 * Effective intent for the button. Driven entirely by `origin`: a saved rule is linked via
 * `origin` (set after save, persisted, durable across reloads), so origin present means 'update';
 * absent means 'create'.
 */
export const getRuleAttachmentIntent = (attachment: RuleAttachment): RuleAttachmentIntent =>
  attachment.origin ? 'update' : 'create';

export const parseRuleFromAttachment = (attachment: RuleAttachment): RuleResponse | null => {
  const text = attachment?.data?.text;
  if (!text) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as RuleResponse;
};

export const getRuleName = (attachment: RuleAttachment): string | undefined => {
  if (attachment?.data?.attachmentLabel) {
    return attachment.data.attachmentLabel;
  }
  return parseRuleFromAttachment(attachment)?.name;
};

export const getRuleTypeLabel = (ruleType: string): string => {
  switch (ruleType) {
    case 'machine_learning':
      return ML_TYPE_DESCRIPTION;
    case 'query':
    case 'saved_query':
      return QUERY_TYPE_DESCRIPTION;
    case 'eql':
      return EQL_TYPE_DESCRIPTION;
    case 'threshold':
      return THRESHOLD_TYPE_DESCRIPTION;
    case 'threat_match':
      return THREAT_MATCH_TYPE_DESCRIPTION;
    case 'new_terms':
      return NEW_TERMS_TYPE_DESCRIPTION;
    case 'esql':
      return ESQL_TYPE_DESCRIPTION;
    default:
      return ruleType;
  }
};

export const getQueryLabel = (rule: RuleResponse): string => {
  switch (rule.type) {
    case 'eql':
      return EQL_QUERY_LABEL;
    case 'esql':
      return ESQL_QUERY_LABEL;
    case 'saved_query':
      return SAVED_QUERY_LABEL;
    default:
      return QUERY_LABEL;
  }
};
