/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mockContext } from '../../../__tests__/commands/context_fixtures';
import { expectErrors } from '../../../__tests__/commands/validation';
import { validate } from './validate';

const ipLocationExpectErrors = (query: string, expectedErrors: string[], context = mockContext) => {
  return expectErrors(query, expectedErrors, context, 'ip_location', validate);
};

describe('IP_LOCATION Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('expression type', () => {
    it('accepts ip fields', () => {
      ipLocationExpectErrors('FROM a | IP_LOCATION geo = ipField', []);
    });

    it('accepts keyword fields', () => {
      ipLocationExpectErrors('FROM a | IP_LOCATION geo = keywordField', []);
    });

    it('raises error on numeric field', () => {
      ipLocationExpectErrors('FROM a | IP_LOCATION geo = doubleField', [
        'IP_LOCATION only supports values of type ip, keyword, text. Found "doubleField" of type double',
      ]);
    });

    it('raises error on boolean field', () => {
      ipLocationExpectErrors('FROM a | IP_LOCATION geo = booleanField', [
        'IP_LOCATION only supports values of type ip, keyword, text. Found "booleanField" of type boolean',
      ]);
    });
  });

  describe('WITH map keys', () => {
    it('accepts valid map keys', () => {
      ipLocationExpectErrors(
        'FROM a | IP_LOCATION geo = ipField WITH { "database_file": "GeoLite2-City.mmdb" }',
        []
      );
      ipLocationExpectErrors('FROM a | IP_LOCATION geo = ipField WITH { "first_only": true }', []);
      ipLocationExpectErrors(
        'FROM a | IP_LOCATION geo = ipField WITH { "properties": ["country_iso_code", "city_name"] }',
        []
      );
    });

    it('raises error on unknown map key', () => {
      ipLocationExpectErrors('FROM a | IP_LOCATION geo = ipField WITH { "unknown_key": "val" }', [
        'Unknown parameter "unknown_key".',
      ]);
    });
  });

  describe('WITH map value types', () => {
    it('raises error when first_only is not boolean', () => {
      ipLocationExpectErrors('FROM a | IP_LOCATION geo = ipField WITH { "first_only": "yes" }', [
        'Invalid type for parameter "first_only". Expected type: boolean. Received: keyword.',
      ]);
    });

    it('raises error when database_file is not a string', () => {
      ipLocationExpectErrors('FROM a | IP_LOCATION geo = ipField WITH { "database_file": 42 }', [
        'Invalid type for parameter "database_file". Expected type: keyword. Received: integer.',
      ]);
    });

    it('raises error when properties is a plain string instead of a list', () => {
      ipLocationExpectErrors(
        'FROM a | IP_LOCATION geo = ipField WITH { "properties": "country_iso_code" }',
        ['Invalid type for parameter "properties". Expected type: list. Received: keyword.']
      );
    });
  });
});
