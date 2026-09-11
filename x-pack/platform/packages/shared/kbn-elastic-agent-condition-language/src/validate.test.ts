/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validateAgentConditionExpression } from './validate';

describe('validateAgentConditionExpression', () => {
  describe('empty / whitespace input', () => {
    it.each(['', '   ', '\n\t', undefined])('returns [] for %p', (input) => {
      expect(validateAgentConditionExpression(input)).toEqual([]);
    });
  });

  describe('non-string input (runtime type mismatch)', () => {
    // condition fields can be stored as non-string values (e.g. boolean `true`); guard against #273082
    it.each([true, false, 1, null, {}, []] as any[])(
      'returns [] without throwing for non-string %p',
      (input) => {
        expect(() => validateAgentConditionExpression(input)).not.toThrow();
        expect(validateAgentConditionExpression(input)).toEqual([]);
      }
    );
  });

  describe('valid expressions', () => {
    it.each([
      "${host.platform} == 'linux'",
      "${host.platform} != 'windows'",
      'arrayContains(${host.tags}, "production")',
      "(${host.platform} == 'linux') and (${host.architecture} == 'x86_64')",
      "${host.platform} == 'linux' or ${host.platform} == 'darwin'",
      'true',
      'not (${host.platform} == "windows")',
      '1 + 2 == 3',
    ])('accepts %p', (input) => {
      expect(validateAgentConditionExpression(input)).toEqual([]);
    });
  });

  describe('syntactic errors', () => {
    it('reports unbalanced parentheses', () => {
      const errors = validateAgentConditionExpression("(${host.platform} == 'linux'");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatchObject({
        line: expect.any(Number),
        column: expect.any(Number),
        message: expect.any(String),
      });
    });

    it('reports unterminated string literal', () => {
      const errors = validateAgentConditionExpression("${host.platform} == 'linux");
      expect(errors.length).toBeGreaterThan(0);
    });

    it('reports invalid operator', () => {
      const errors = validateAgentConditionExpression("${host.platform} === 'linux'");
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('error shape', () => {
    it('returns objects with numeric line, numeric column, and string message', () => {
      const [error] = validateAgentConditionExpression('@');
      expect(error).toEqual({
        line: expect.any(Number),
        column: expect.any(Number),
        message: expect.any(String),
      });
      expect(error.message.length).toBeGreaterThan(0);
    });
  });
});
