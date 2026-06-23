/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertTags, AlertAssignees } from '../../../../../../common/api/detection_engine';
import * as i18n from '../../signals/translations';

export const validateAlertTagsArrays = (tags: AlertTags, ids: string[]) => {
  const validationErrors = [];
  if (ids.length === 0) {
    validationErrors.push(i18n.NO_IDS_VALIDATION_ERROR);
  }
  const { tags_to_add: tagsToAdd, tags_to_remove: tagsToRemove } = tags;
  const duplicates = tagsToAdd.filter((tag) => tagsToRemove.includes(tag));
  if (duplicates.length) {
    validationErrors.push(i18n.ALERT_TAGS_VALIDATION_ERROR(JSON.stringify(duplicates)));
  }
  return validationErrors;
};

export const validateAlertAssigneesArrays = (assignees: AlertAssignees) => {
  const validationErrors = [];
  const { add: assigneesToAdd, remove: assigneesToRemove } = assignees;
  const duplicates = assigneesToAdd.filter((assignee) => assigneesToRemove.includes(assignee));
  if (duplicates.length) {
    validationErrors.push(i18n.ALERT_ASSIGNEES_VALIDATION_ERROR(JSON.stringify(duplicates)));
  }
  return validationErrors;
};
