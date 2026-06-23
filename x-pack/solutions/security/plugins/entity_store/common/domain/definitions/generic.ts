/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { newestValue } from './field_retention_operations';
import type { EntityDefinitionWithoutId } from './entity_schema';
import {
  ENTITY_SOURCE_FIELD_EVALUATION,
  getCommonFieldDescriptions,
  getEntityFieldsDescriptions,
} from './common_fields';

export const genericEntityDefinition = {
  type: 'generic',
  name: `Security 'generic' Entity Store Definition`,
  identityField: { singleField: 'entity.id', skipTypePrepend: true },
  indexPatterns: [],
  fieldEvaluations: [ENTITY_SOURCE_FIELD_EVALUATION],
  fields: [
    // We want this to make sure it's also extracted on remote log extraction
    newestValue({ source: 'entity.id' }),
    newestValue({ source: 'entity.name' }),
    ...getEntityFieldsDescriptions(),

    newestValue({ source: 'cloud.account.id' }),
    newestValue({ source: 'cloud.account.name' }),
    newestValue({ source: 'cloud.availability_zone' }),
    newestValue({ source: 'cloud.instance.id' }),
    newestValue({ source: 'cloud.instance.name' }),
    newestValue({ source: 'cloud.machine.type' }),
    newestValue({ source: 'cloud.project.id' }),
    newestValue({ source: 'cloud.project.name' }),
    newestValue({ source: 'cloud.provider' }),
    newestValue({ source: 'cloud.region' }),
    newestValue({ source: 'cloud.service.name' }),

    newestValue({ source: 'orchestrator.api_version' }),
    newestValue({ source: 'orchestrator.cluster.id' }),
    newestValue({ source: 'orchestrator.cluster.name' }),
    newestValue({ source: 'orchestrator.cluster.url' }),
    newestValue({ source: 'orchestrator.cluster.version' }),
    newestValue({ source: 'orchestrator.namespace' }),
    newestValue({ source: 'orchestrator.organization' }),
    newestValue({ source: 'orchestrator.resource.annotation' }),
    newestValue({ source: 'orchestrator.resource.id' }),
    newestValue({ source: 'orchestrator.resource.ip', mapping: { type: 'ip' } }),
    newestValue({ source: 'orchestrator.resource.label' }),
    newestValue({ source: 'orchestrator.resource.name' }),
    newestValue({ source: 'orchestrator.resource.parent.type' }),
    newestValue({ source: 'orchestrator.resource.type' }),
    newestValue({ source: 'orchestrator.type' }),

    ...getCommonFieldDescriptions('entity'),
  ],
} satisfies EntityDefinitionWithoutId;
