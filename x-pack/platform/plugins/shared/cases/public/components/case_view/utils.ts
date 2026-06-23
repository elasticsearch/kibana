/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import deepEqual from 'fast-deep-equal';

import type { CaseConnector } from '../../../common/types/domain';
import { CASE_EXTENDED_FIELDS } from '../../../common/constants';
import type { CaseUI, UpdateByKey, UpdateKey } from '../../containers/types';
import { getTypedPayload } from '../../containers/utils';

interface ProcessFieldUpdateParams {
  key: string;
  value: unknown;
  caseData: CaseUI;
  callUpdate: (updateKey: UpdateKey, updateValue: UpdateByKey['updateValue']) => void;
}

const processTitle = (value: unknown, callUpdate: ProcessFieldUpdateParams['callUpdate']): void => {
  const titleUpdate = getTypedPayload<string>(value);
  if (titleUpdate.length > 0) {
    callUpdate('title', titleUpdate);
  }
};

const processDescription = (
  value: unknown,
  callUpdate: ProcessFieldUpdateParams['callUpdate']
): void => {
  const descriptionUpdate = getTypedPayload<string>(value);
  if (descriptionUpdate.length > 0) {
    callUpdate('description', descriptionUpdate);
  }
};

const processConnector = (
  value: unknown,
  callUpdate: ProcessFieldUpdateParams['callUpdate']
): void => {
  const connector = getTypedPayload<CaseConnector>(value);
  if (connector != null) {
    callUpdate('connector', connector);
  }
};

const processTags = (value: unknown, callUpdate: ProcessFieldUpdateParams['callUpdate']): void => {
  const tagsUpdate = getTypedPayload<string[]>(value);
  callUpdate('tags', tagsUpdate);
};

const processCategory = (
  value: unknown,
  callUpdate: ProcessFieldUpdateParams['callUpdate']
): void => {
  const categoryUpdate = getTypedPayload<string>(value);
  callUpdate('category', categoryUpdate);
};

const processStatus = (
  value: unknown,
  caseData: CaseUI,
  callUpdate: ProcessFieldUpdateParams['callUpdate']
): void => {
  const statusUpdate = getTypedPayload<string>(value);
  if (caseData.status !== value) {
    callUpdate('status', statusUpdate);
  }
};

const processSettings = (
  value: unknown,
  caseData: CaseUI,
  callUpdate: ProcessFieldUpdateParams['callUpdate']
): void => {
  const settingsUpdate = getTypedPayload<CaseUI['settings']>(value);
  if (caseData.settings !== value) {
    callUpdate('settings', settingsUpdate);
  }
};

const processSeverity = (
  value: unknown,
  caseData: CaseUI,
  callUpdate: ProcessFieldUpdateParams['callUpdate']
): void => {
  const severityUpdate = getTypedPayload<CaseUI['severity']>(value);
  if (caseData.severity !== value) {
    callUpdate('severity', severityUpdate);
  }
};

const processAssignees = (
  value: unknown,
  caseData: CaseUI,
  callUpdate: ProcessFieldUpdateParams['callUpdate']
): void => {
  const assigneesUpdate = getTypedPayload<CaseUI['assignees']>(value);
  if (!deepEqual(caseData.assignees, value)) {
    callUpdate('assignees', assigneesUpdate);
  }
};

const processCustomFields = (
  value: unknown,
  caseData: CaseUI,
  callUpdate: ProcessFieldUpdateParams['callUpdate']
): void => {
  const customFields = getTypedPayload<CaseUI['customFields']>(value);
  if (!deepEqual(caseData.customFields, value)) {
    callUpdate('customFields', customFields);
  }
};

const processExtendedFields = (
  value: unknown,
  callUpdate: ProcessFieldUpdateParams['callUpdate']
): void => {
  const extendedFieldsValue = getTypedPayload<Record<string, string>>(value);
  // Send only this section's own fields. The server merges them with the existing
  // extended_fields so that concurrent saves from GlobalCaseFields and TemplateFields
  // (two independent RHF form instances) don't overwrite each other.
  callUpdate(CASE_EXTENDED_FIELDS, extendedFieldsValue ?? {});
};

export const processFieldUpdate = ({
  key,
  value,
  caseData,
  callUpdate,
}: ProcessFieldUpdateParams): void => {
  switch (key) {
    case 'title':
      return processTitle(value, callUpdate);
    case 'connector':
      return processConnector(value, callUpdate);
    case 'description':
      return processDescription(value, callUpdate);
    case 'tags':
      return processTags(value, callUpdate);
    case 'category':
      return processCategory(value, callUpdate);
    case 'status':
      return processStatus(value, caseData, callUpdate);
    case 'settings':
      return processSettings(value, caseData, callUpdate);
    case 'severity':
      return processSeverity(value, caseData, callUpdate);
    case 'assignees':
      return processAssignees(value, caseData, callUpdate);
    case 'customFields':
      return processCustomFields(value, caseData, callUpdate);
    case CASE_EXTENDED_FIELDS:
      return processExtendedFields(value, callUpdate);
    default:
      break;
  }
};
