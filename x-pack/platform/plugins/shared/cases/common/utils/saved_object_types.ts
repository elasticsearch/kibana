/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  CASE_SAVED_OBJECT,
  CASE_CONNECTOR_MAPPINGS_SAVED_OBJECT,
  CASE_USER_ACTION_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
  CASE_CONFIGURE_SAVED_OBJECT,
  CASE_TEMPLATE_SAVED_OBJECT,
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_FIELD_DEFINITION_SAVED_OBJECT,
} from '../constants';

interface CasesConfigType {
  templates?: {
    enabled?: boolean;
  };
}

/**
 * If more values are added here please also add them here: x-pack/test/cases_api_integration/common/plugins
 */
export const getSavedObjectsTypes = (config?: Partial<CasesConfigType>): string[] => {
  const baseSavedObjects = [
    CASE_SAVED_OBJECT,
    CASE_CONNECTOR_MAPPINGS_SAVED_OBJECT,
    CASE_USER_ACTION_SAVED_OBJECT,
    CASE_COMMENT_SAVED_OBJECT,
    CASE_CONFIGURE_SAVED_OBJECT,
    CASE_ATTACHMENT_SAVED_OBJECT,
  ];

  const experimentalSOs: string[] = [];

  if (config?.templates?.enabled) {
    experimentalSOs.push(CASE_TEMPLATE_SAVED_OBJECT);
    experimentalSOs.push(CASE_FIELD_DEFINITION_SAVED_OBJECT);
  }

  return [...baseSavedObjects, ...experimentalSOs];
};
