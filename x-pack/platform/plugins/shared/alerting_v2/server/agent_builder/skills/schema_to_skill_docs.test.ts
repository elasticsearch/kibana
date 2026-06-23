/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  generateRuleSchemaDoc,
  generateRuleOperationsDoc,
  generateActionPolicySchemaDoc,
} from './schema_to_skill_docs';

describe('schema_to_skill_docs', () => {
  describe('generateRuleSchemaDoc', () => {
    it('matches the snapshot', () => {
      expect(generateRuleSchemaDoc()).toMatchSnapshot();
    });

    it('includes key field names from the schema', () => {
      const doc = generateRuleSchemaDoc();
      expect(doc).toContain('`kind`');
      expect(doc).toContain('`metadata`');
      expect(doc).toContain('`schedule`');
      expect(doc).toContain('`query`');
      expect(doc).toContain('`recovery_strategy`');
      expect(doc).toContain('`no_data_strategy`');
      expect(doc).toContain('`state_transition`');
    });

    it('does not contain stale field names', () => {
      const doc = generateRuleSchemaDoc();
      expect(doc).not.toContain('consecutive_breaches');
      expect(doc).not.toContain('evaluation');
      expect(doc).not.toContain('recovery_policy');
    });
  });

  describe('generateRuleOperationsDoc', () => {
    it('matches the snapshot', () => {
      expect(generateRuleOperationsDoc()).toMatchSnapshot();
    });

    it('includes all operation types', () => {
      const doc = generateRuleOperationsDoc();
      expect(doc).toContain('set_metadata');
      expect(doc).toContain('set_kind');
      expect(doc).toContain('set_schedule');
      expect(doc).toContain('set_query');
      expect(doc).toContain('set_grouping');
      expect(doc).toContain('set_state_transition');
      expect(doc).toContain('validate');
    });

    it('includes pending_count and recovering_count fields', () => {
      const doc = generateRuleOperationsDoc();
      expect(doc).toContain('pending_count');
      expect(doc).toContain('recovering_count');
    });
  });

  describe('generateActionPolicySchemaDoc', () => {
    it('matches the snapshot', () => {
      expect(generateActionPolicySchemaDoc()).toMatchSnapshot();
    });

    it('includes key field names', () => {
      const doc = generateActionPolicySchemaDoc();
      expect(doc).toContain('`name`');
      expect(doc).toContain('`destinations`');
      expect(doc).toContain('`matcher`');
      expect(doc).toContain('`groupingMode`');
      expect(doc).toContain('`throttle`');
    });
  });
});
