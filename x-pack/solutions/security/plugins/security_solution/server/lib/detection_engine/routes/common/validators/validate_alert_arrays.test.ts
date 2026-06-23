/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validateAlertAssigneesArrays, validateAlertTagsArrays } from './validate_alert_arrays';

describe('signals route helpers', () => {
  describe('validateAlertTagsArrays', () => {
    it('returns no errors for a valid request', () => {
      expect(
        validateAlertTagsArrays({ tags_to_add: ['tag1'], tags_to_remove: ['tag2'] }, ['id1'])
      ).toEqual([]);
    });

    it('returns an error when no ids are provided', () => {
      expect(
        validateAlertTagsArrays({ tags_to_add: ['tag1'], tags_to_remove: [] }, [])
      ).toHaveLength(1);
    });

    it('returns an error when a tag is both added and removed', () => {
      expect(
        validateAlertTagsArrays({ tags_to_add: ['tag1'], tags_to_remove: ['tag1'] }, ['id1'])
      ).toHaveLength(1);
    });
  });

  describe('validateAlertAssigneesArrays', () => {
    it('returns no errors for a valid request', () => {
      expect(validateAlertAssigneesArrays({ add: ['user1'], remove: ['user2'] })).toEqual([]);
    });

    it('returns an error when an assignee is both added and removed', () => {
      expect(validateAlertAssigneesArrays({ add: ['user1'], remove: ['user1'] })).toHaveLength(1);
    });
  });
});
