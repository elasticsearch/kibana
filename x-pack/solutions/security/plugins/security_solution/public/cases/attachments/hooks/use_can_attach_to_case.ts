/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { APP_ID } from '../../../../common/constants';
import { useKibana } from '../../../common/lib/kibana';

/**
 * Returns whether the current user can attach a Security Solution document or entity to a case.
 *
 * `createComment` is the sub-privilege the Cases `BulkCreateAttachments` API enforces;
 * `read` is what lets the case selector modal list existing cases.
 * `create` and `update` are not checked: they live inside the single base `all` privilege
 * and cannot be held independently, so checking them adds no signal. Owner is scoped to
 * `APP_ID` (`securitySolution`) to match what the Cases API enforces.
 */
export const useCanAttachToCase = (): boolean => {
  const { cases } = useKibana().services;
  const permissions = cases.helpers.canUseCases([APP_ID]);
  return permissions.createComment && permissions.read;
};
