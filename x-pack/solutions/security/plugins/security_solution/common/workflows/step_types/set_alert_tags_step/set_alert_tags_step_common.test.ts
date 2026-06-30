/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setAlertTagsInputSchema } from './set_alert_tags_step_common';
import { MAX_ALERT_ID_LENGTH } from '../common/constants';

describe('setAlertTagsInputSchema', () => {
  it('should validate adding tags to a single alert', () => {
    const input = { alert_ids: 'alert-1', tags_to_add: ['triaged'] };
    expect(setAlertTagsInputSchema.parse(input)).toEqual({
      alert_ids: 'alert-1',
      tags_to_add: ['triaged'],
      tags_to_remove: [],
    });
  });

  it('should validate removing tags from multiple alerts', () => {
    const input = {
      alert_ids: ['alert-1', 'alert-2'],
      tags_to_remove: ['needs-review'],
    };
    expect(setAlertTagsInputSchema.parse(input)).toEqual({
      alert_ids: ['alert-1', 'alert-2'],
      tags_to_add: [],
      tags_to_remove: ['needs-review'],
    });
  });

  it('should validate adding and removing tags in the same call', () => {
    const input = {
      alert_ids: 'alert-1',
      tags_to_add: ['escalated'],
      tags_to_remove: ['needs-review'],
    };
    expect(setAlertTagsInputSchema.parse(input)).toEqual(input);
  });

  it('should default tags_to_add and tags_to_remove to empty arrays', () => {
    const input = { alert_ids: 'alert-1', tags_to_add: ['triaged'] };
    const parsed = setAlertTagsInputSchema.parse(input);
    expect(parsed.tags_to_remove).toEqual([]);
  });

  it('should fail if alert_ids is missing', () => {
    const input = { tags_to_add: ['triaged'] };
    expect(() => setAlertTagsInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids is an empty string', () => {
    const input = { alert_ids: '', tags_to_add: ['triaged'] };
    expect(() => setAlertTagsInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids is an empty array', () => {
    const input = { alert_ids: [], tags_to_add: ['triaged'] };
    expect(() => setAlertTagsInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids array contains an empty string', () => {
    const input = { alert_ids: ['alert-1', ''], tags_to_add: ['triaged'] };
    expect(() => setAlertTagsInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids string is too long', () => {
    const input = {
      alert_ids: 'a'.repeat(MAX_ALERT_ID_LENGTH + 1),
      tags_to_add: ['triaged'],
    };
    expect(() => setAlertTagsInputSchema.parse(input)).toThrow();
  });

  it('should fail if neither tags_to_add nor tags_to_remove is provided', () => {
    const input = { alert_ids: 'alert-1' };
    expect(() => setAlertTagsInputSchema.parse(input)).toThrow();
  });

  it('should fail if both tags_to_add and tags_to_remove are empty arrays', () => {
    const input = { alert_ids: 'alert-1', tags_to_add: [], tags_to_remove: [] };
    expect(() => setAlertTagsInputSchema.parse(input)).toThrow();
  });

  it('should fail if a tag is an empty string', () => {
    const input = { alert_ids: 'alert-1', tags_to_add: [''] };
    expect(() => setAlertTagsInputSchema.parse(input)).toThrow();
  });
});
