/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import Fs from 'node:fs';
import Path from 'node:path';
import { REPO_ROOT } from '@kbn/repo-info';
import { parse } from 'yaml';
import addFormats from 'ajv-formats';
import Ajv, { type ErrorObject } from 'ajv-draft-04';
import { checkRefs } from './resolve';

export const OAS_3_0_SCHEMA_PATH = Path.resolve(__dirname, './schema.json');

export function validate(relativePathToYaml: string): { valid: boolean; errors?: ErrorObject[] } {
  const yaml = parse(
    Fs.readFileSync(Path.resolve(REPO_ROOT, relativePathToYaml)).toString('utf-8'),
    { schema: 'core' }
  );
  const schema = JSON.parse(Fs.readFileSync(OAS_3_0_SCHEMA_PATH, 'utf-8'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  // ajv.addFormat('media-range', true); // used in 3.1
  const validator = ajv.compile(schema);

  const schemaResult = validator(yaml);

  if (schemaResult) {
    return checkRefs(schemaResult);
  }

  const result: { valid: boolean; errors?: ErrorObject[] } = {
    valid: false,
  };

  if (validator.errors) {
    result.errors = validator.errors;
  }

  return result;
}
