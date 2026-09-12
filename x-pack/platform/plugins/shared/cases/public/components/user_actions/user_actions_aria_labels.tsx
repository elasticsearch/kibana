/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UserActionTypes } from '../../../common/types/domain';
import * as i18n from './translations';

export const getUserActionAriaLabel = (type: keyof typeof UserActionTypes) => {
  const actionsMap: Record<keyof typeof UserActionTypes, string> = {
    assignees: i18n.ASSIGNEES,
    comment: i18n.COMMENT,
    connector: i18n.CONNECTORS,
    description: i18n.DESCRIPTION,
    pushed: i18n.PUSHED_NEW_INCIDENT,
    tags: i18n.TAGS,
    title: i18n.TITLE,
    status: i18n.STATUS,
    settings: i18n.SETTING,
    severity: i18n.SEVERITY,
    create_case: i18n.CASE_INITIATED,
    delete_case: i18n.CASE_DELETED,
    category: i18n.CATEGORY,
    customFields: i18n.CUSTOM_FIELDS,
    observables: i18n.OBSERVABLES,
    extended_fields: i18n.EXTENDED_FIELDS,
    template: i18n.APPLIED_TEMPLATE,
    workflow: i18n.WORKFLOW_RAN,
  };

  switch (type) {
    case 'create_case':
    case 'delete_case':
    case 'pushed':
    case 'workflow':
      return actionsMap[type];
    default:
      return i18n.USER_ACTION_EDITED(actionsMap[type]);
  }
};
