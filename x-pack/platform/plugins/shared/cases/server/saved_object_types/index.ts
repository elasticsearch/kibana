/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, Logger } from '@kbn/core/server';
import type { LensServerPluginSetup } from '@kbn/lens-plugin/server';
import { createCaseSavedObjectType } from './cases/cases';
import { caseConfigureSavedObjectType } from './configure';
import { createCaseCommentSavedObjectType } from './comments';
import { createCaseUserActionSavedObjectType } from './user_actions';
import { caseConnectorMappingsSavedObjectType } from './connector_mappings';
import { casesTelemetrySavedObjectType } from './telemetry';
import { casesRulesSavedObjectType } from './cases_rules';
import { caseIdIncrementerSavedObjectType } from './id_incrementer';
import { createCaseAttachmentSavedObjectType } from './attachments';
import type { PersistableStateAttachmentTypeRegistry } from '../attachment_framework/persistable_state_registry';
import { caseTemplateSavedObjectType } from './templates';
import { caseFieldDefinitionSavedObjectType } from './field_definitions';
import type { ConfigType } from '../config';

interface RegisterSavedObjectsArgs {
  core: CoreSetup;
  logger: Logger;
  persistableStateAttachmentTypeRegistry: PersistableStateAttachmentTypeRegistry;
  lensEmbeddableFactory: LensServerPluginSetup['lensEmbeddableFactory'];
  config: ConfigType;
}

export const registerSavedObjects = ({
  core,
  logger,
  persistableStateAttachmentTypeRegistry,
  lensEmbeddableFactory,
  config,
}: RegisterSavedObjectsArgs) => {
  core.savedObjects.registerType(
    createCaseCommentSavedObjectType({
      migrationDeps: {
        persistableStateAttachmentTypeRegistry,
        lensEmbeddableFactory,
      },
    })
  );

  core.savedObjects.registerType(caseConfigureSavedObjectType);
  core.savedObjects.registerType(caseConnectorMappingsSavedObjectType);
  core.savedObjects.registerType(caseIdIncrementerSavedObjectType);
  core.savedObjects.registerType(createCaseSavedObjectType(core, logger, config));
  core.savedObjects.registerType(
    createCaseUserActionSavedObjectType({
      persistableStateAttachmentTypeRegistry,
    })
  );

  core.savedObjects.registerType(casesTelemetrySavedObjectType);
  core.savedObjects.registerType(casesRulesSavedObjectType);

  if (config.templates?.enabled) {
    // eslint-disable-next-line @kbn/eslint/no_conditional_saved_object_type_registration -- TODO: remove conditional registration; tracked for follow-up PR
    core.savedObjects.registerType(caseTemplateSavedObjectType);
    // eslint-disable-next-line @kbn/eslint/no_conditional_saved_object_type_registration -- caseFieldDefinitionSavedObjectType is part of the templates feature which is behind a feature flag
    core.savedObjects.registerType(caseFieldDefinitionSavedObjectType);
  }
  if (config.attachments?.enabled) {
    // eslint-disable-next-line @kbn/eslint/no_conditional_saved_object_type_registration -- TODO: remove conditional registration; tracked for follow-up PR
    core.savedObjects.registerType(createCaseAttachmentSavedObjectType());
  }
};
