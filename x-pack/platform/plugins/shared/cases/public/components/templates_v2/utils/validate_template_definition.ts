/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as parseYaml } from 'yaml';
import { ParsedTemplateDefinitionSchema } from '../../../../common/types/domain/template/v1';
import {
  TEMPLATE_DEFINITION_EMPTY,
  INVALID_YAML_NON_OBJECT,
  INVALID_YAML_DEFINITION,
} from '../translations';

export type TemplateDefinitionValidationResult =
  | { success: true }
  | { success: false; message: string };

export const validateTemplateDefinitionYaml = (
  definition: string
): TemplateDefinitionValidationResult => {
  try {
    if (!definition || definition.trim() === '') {
      return { success: false, message: TEMPLATE_DEFINITION_EMPTY };
    }

    const parsedDefinition = parseYaml(definition);

    if (!parsedDefinition || typeof parsedDefinition !== 'object') {
      return { success: false, message: INVALID_YAML_NON_OBJECT };
    }

    const result = ParsedTemplateDefinitionSchema.safeParse(parsedDefinition);
    if (!result.success) {
      return { success: false, message: result.error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : INVALID_YAML_DEFINITION,
    };
  }
};
