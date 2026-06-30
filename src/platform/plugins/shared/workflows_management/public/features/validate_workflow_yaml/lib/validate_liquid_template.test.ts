/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import { validateLiquidTemplate } from './validate_liquid_template';

describe('validateLiquidTemplate', () => {
  describe('valid templates', () => {
    it('returns empty array for valid liquid in a scalar', () => {
      const yaml = 'message: "Hello {{ name }} world"';
      const doc = parseDocument(yaml);

      expect(validateLiquidTemplate(yaml, doc)).toEqual([]);
    });

    it('returns empty array for plain text without liquid', () => {
      const yaml = 'message: plain text';
      const doc = parseDocument(yaml);

      expect(validateLiquidTemplate(yaml, doc)).toEqual([]);
    });
  });

  describe('error transformation', () => {
    it('returns YamlValidationResult with liquid-template owner for invalid filter', () => {
      const yaml = 'message: "Hello {{ name | unknownFilter }} world"';
      const doc = parseDocument(yaml);

      const result = validateLiquidTemplate(yaml, doc);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({
        owner: 'liquid-template-validation',
        severity: 'error',
        message: expect.stringContaining('unknownFilter'),
      });
      expect(result[0].id).toMatch(/^liquid-template-/);
      expect(result[0].hoverMessage).toEqual(result[0].message);
    });

    it('returns errors with line and column for invalid tag', () => {
      const yaml = 'line1: ok\nmessage: "{% unknownTag %}"';
      const doc = parseDocument(yaml);

      const result = validateLiquidTemplate(yaml, doc);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({
        owner: 'liquid-template-validation',
        severity: 'error',
        startLineNumber: expect.any(Number),
        startColumn: expect.any(Number),
        endLineNumber: expect.any(Number),
        endColumn: expect.any(Number),
      });
      expect(result[0].startLineNumber).toBeGreaterThan(0);
    });
  });
});
