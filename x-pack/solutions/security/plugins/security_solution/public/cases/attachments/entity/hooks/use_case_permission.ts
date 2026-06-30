/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CasesPermissions } from '@kbn/cases-plugin/common';
import { useKibana } from '../../../../common/lib/kibana';

export interface EntityCasePermissions {
  canAddToExistingCase: boolean;
  canAddToNewCase: boolean;
}

/**
 * Returns if a user can add an entity to an existing or new case based on Cases permissions.
 * `createComment` is required because attachments are added as case comment/user-action entries.
 * Existing case requires `update` + `createComment`; new case requires `create` + `createComment`.
 */
export const useEntityCasePermissions = (): EntityCasePermissions => {
  const { cases } = useKibana().services;
  const permissions: CasesPermissions = cases.helpers.canUseCases();

  return {
    canAddToExistingCase: permissions.update && permissions.createComment,
    canAddToNewCase: permissions.create && permissions.createComment,
  };
};
