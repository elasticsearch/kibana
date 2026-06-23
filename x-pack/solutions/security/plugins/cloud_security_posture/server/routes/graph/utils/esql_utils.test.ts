/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getFieldNamespace,
  generateFieldHintCases,
  concatJsonObjectPropertyEsqlExprSafe,
  concatJsonObjectPropertyEsqlExprAsString,
  escapeJsonStringValueEsql,
} from './esql_utils';

describe('ESQL utils', () => {
  describe('getFieldNamespace', () => {
    it('should extract namespace from user.entity.id', () => {
      expect(getFieldNamespace('user.entity.id')).toBe('user');
    });

    it('should extract namespace from service.entity.id', () => {
      expect(getFieldNamespace('service.entity.id')).toBe('service');
    });

    it('should extract namespace from host.entity.id', () => {
      expect(getFieldNamespace('host.entity.id')).toBe('host');
    });

    it('should extract namespace from user.target.entity.id', () => {
      expect(getFieldNamespace('user.target.entity.id')).toBe('user');
    });

    it('should extract namespace from service.target.entity.id', () => {
      expect(getFieldNamespace('service.target.entity.id')).toBe('service');
    });

    it('should return "entity" for entity.id', () => {
      expect(getFieldNamespace('entity.id')).toBe('entity');
    });

    it('should return "entity" for entity.target.id', () => {
      expect(getFieldNamespace('entity.target.id')).toBe('entity');
    });
  });

  describe('generateFieldHintCases', () => {
    it('should generate CASE statements for actor fields', () => {
      const result = generateFieldHintCases(
        ['user.entity.id', 'service.entity.id', 'entity.id'],
        'actorEntityId'
      );

      expect(result).toBe(
        `    MV_CONTAINS(user.entity.id, actorEntityId), "user",
    MV_CONTAINS(service.entity.id, actorEntityId), "service",
    MV_CONTAINS(entity.id, actorEntityId), "entity"`
      );
    });

    it('should generate CASE statements for target fields', () => {
      const result = generateFieldHintCases(
        ['user.target.entity.id', 'service.target.entity.id', 'entity.target.id'],
        'targetEntityId'
      );

      expect(result).toBe(
        `    MV_CONTAINS(user.target.entity.id, targetEntityId), "user",
    MV_CONTAINS(service.target.entity.id, targetEntityId), "service",
    MV_CONTAINS(entity.target.id, targetEntityId), "entity"`
      );
    });

    it('should handle single field', () => {
      const result = generateFieldHintCases(['user.entity.id'], 'actorEntityId');

      expect(result).toBe(`    MV_CONTAINS(user.entity.id, actorEntityId), "user"`);
    });

    it('should handle empty array', () => {
      const result = generateFieldHintCases([], 'actorEntityId');

      expect(result).toBe('');
    });
  });

  describe('escapeJsonStringValueEsql', () => {
    it('should wrap the expression in REPLACE calls that escape backslashes then double quotes', () => {
      const result = escapeJsonStringValueEsql('entityName');

      // Backslash is escaped first (\ -> \\), then double quote (" -> \").
      // Backslash counts reflect ES|QL string-literal + Java regex/replacement semantics.
      expect(result).toBe(
        String.raw`REPLACE(REPLACE(entityName, "\\\\", "\\\\\\\\"), "\"", "\\\\\"")`
      );
    });

    it('should escape backslashes before quotes (regression for DOMAIN\\user EUIDs)', () => {
      const result = escapeJsonStringValueEsql('value');
      const backslashIndex = result.indexOf(String.raw`"\\\\"`);
      const quoteIndex = result.indexOf(String.raw`"\""`);

      expect(backslashIndex).toBeGreaterThanOrEqual(0);
      expect(quoteIndex).toBeGreaterThanOrEqual(0);
      // The inner REPLACE (backslash) must run before the outer REPLACE (quote),
      // so the backslash pattern must appear earlier in the generated expression.
      expect(backslashIndex).toBeLessThan(quoteIndex);
    });
  });

  describe('formatJsonProperty', () => {
    it('should generate ESQL that outputs JSON property (with escaped value), or empty string if null', () => {
      const result = concatJsonObjectPropertyEsqlExprSafe('name', 'entityName');

      expect(result).toBe(
        `COALESCE(CONCAT("\\"name\\":\\"", ${escapeJsonStringValueEsql('entityName')}, "\\""), "")`
      );
    });

    it('should escape the value embedded by concatJsonObjectPropertyEsqlExprAsString', () => {
      const result = concatJsonObjectPropertyEsqlExprAsString('id', 'actorEntityId');

      expect(result).toBe(
        `CONCAT("\\"id\\":\\"", ${escapeJsonStringValueEsql('actorEntityId')}, "\\"")`
      );
    });

    it('should include the property name and variable in the output', () => {
      const result = concatJsonObjectPropertyEsqlExprSafe('customProp', 'customVar');

      expect(result).toContain('customProp');
      expect(result).toContain('customVar');
    });
  });
});
