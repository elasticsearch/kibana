/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as yamlParse } from 'yaml';
import type { Template, ParsedTemplate } from '../../../../common/types/domain/template/v1';
import { ParsedTemplateDefinitionSchema } from '../../../../common/types/domain/template/v1';

/**
 * Parse a raw template definition (YAML string) into a ParsedTemplate
 * NOTE: this will be moved to a service / domain layer or even the schema itself
 */
export const parseTemplate = (template: Template): ParsedTemplate => {
  const parsedDefinition = ParsedTemplateDefinitionSchema.parse(yamlParse(template.definition));

  return {
    templateId: template.templateId,
    name: template.name,
    owner: template.owner,
    definition: parsedDefinition,
    definitionString: template.definition,
    templateVersion: template.templateVersion,
    deletedAt: template.deletedAt,
    description: template.description,
    tags: template.tags,
    author: template.author,
    usageCount: template.usageCount,
    fieldCount: template.fieldCount,
    fieldNames: template.fieldNames,
    lastUsedAt: template.lastUsedAt,
    isDefault: template.isDefault,
    isLatest: template.isLatest ?? false,
    isEnabled: template.isEnabled ?? true,
    latestVersion: 1,
  };
};
