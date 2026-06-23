/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq } from 'lodash';

import type { FeatureKibanaPrivileges, KibanaFeature } from '@kbn/features-plugin/server';

import { BaseFeaturePrivilegeBuilder } from './feature_privilege_builder';

export type CasesSupportedOperations = (typeof supportedOperations)[number];

/**
 * If you add a new operation type (all, push, update, etc) you should also
 * extend the mapping here x-pack/platform/plugins/shared/features/server/feature_privilege_iterator/feature_privilege_iterator.ts
 *
 * Also if you add a new operation (createCase, updateCase, etc) here you'll likely also need to make changes here:
 * x-pack/platform/plugins/shared/cases/server/authorization/index.ts and here x-pack/platform/plugins/shared/cases/server/connectors/cases/utils.ts
 */

const pushOperations = ['pushCase'] as const;
const createOperations = ['createCase'] as const;
const readOperations = [
  'getCase',
  'getComment',
  'getTags',
  'getReporters',
  'getUserActions',
  'findConfigurations',
  'getFieldDefinitions',
] as const;
// Update operations do not currently include the ability to re-open a case
const updateOperations = ['updateCase', 'updateComment'] as const;
const deleteOperations = ['deleteCase', 'deleteComment'] as const;
const settingsOperations = ['createConfiguration', 'updateConfiguration'] as const;
const createCommentOperations = ['createComment'] as const;
const reopenOperations = ['reopenCase'] as const;
const assignOperations = ['assignCase'] as const;
const manageTemplatesOperations = ['manageTemplate'] as const;
const allOperations = [
  ...pushOperations,
  ...createOperations,
  ...readOperations,
  ...updateOperations,
  ...deleteOperations,
  ...settingsOperations,
  ...createCommentOperations,
  ...reopenOperations,
  ...assignOperations,
] as const;
const supportedOperations = [...allOperations, ...manageTemplatesOperations] as const;

export class FeaturePrivilegeCasesBuilder extends BaseFeaturePrivilegeBuilder {
  public getActions(
    privilegeDefinition: FeatureKibanaPrivileges,
    feature: KibanaFeature
  ): string[] {
    const getCasesPrivilege = (
      operations: readonly CasesSupportedOperations[],
      owners: readonly string[] = []
    ) => {
      return owners.flatMap((owner) =>
        operations.map((operation) => this.actions.cases.get(owner, operation))
      );
    };
    return uniq([
      ...getCasesPrivilege(allOperations, privilegeDefinition.cases?.all),
      ...getCasesPrivilege(pushOperations, privilegeDefinition.cases?.push),
      ...getCasesPrivilege(createOperations, privilegeDefinition.cases?.create),
      ...getCasesPrivilege(readOperations, privilegeDefinition.cases?.read),
      ...getCasesPrivilege(updateOperations, privilegeDefinition.cases?.update),
      ...getCasesPrivilege(deleteOperations, privilegeDefinition.cases?.delete),
      ...getCasesPrivilege(settingsOperations, privilegeDefinition.cases?.settings),
      ...getCasesPrivilege(createCommentOperations, privilegeDefinition.cases?.createComment),
      ...getCasesPrivilege(reopenOperations, privilegeDefinition.cases?.reopenCase),
      ...getCasesPrivilege(assignOperations, privilegeDefinition.cases?.assign),
      ...getCasesPrivilege(manageTemplatesOperations, privilegeDefinition.cases?.manageTemplates),
      // manageTemplates users need read access to the field library even when they lack cases.read
      ...getCasesPrivilege(['getFieldDefinitions'], privilegeDefinition.cases?.manageTemplates),
    ]);
  }
}
