/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document, LineCounter } from 'yaml';
import { validateLiquidYamlScalars } from './validate_liquid_yaml_scalars';
import type { YamlValidationResult } from '../model/types';

export function validateLiquidTemplate(
  yamlString: string,
  yamlDocument: Document,
  lineCounter: LineCounter
): YamlValidationResult[] {
  return validateLiquidYamlScalars(yamlString, yamlDocument, lineCounter).filter(
    (result) => result.owner === 'liquid-template-validation'
  );
}
