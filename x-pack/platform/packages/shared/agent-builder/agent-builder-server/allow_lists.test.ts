/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isAllowedBuiltinAttachment, isAllowedSkillRegistration } from './allow_lists';
import { ELASTIC_SKILLS_BASE_PATH } from './skills/type_definition';

describe('isAllowedBuiltinAttachment', () => {
  it('returns true for listed attachment type ids', () => {
    expect(isAllowedBuiltinAttachment('text')).toBe(true);
    expect(isAllowedBuiltinAttachment('esql')).toBe(true);
    expect(isAllowedBuiltinAttachment('platform.dashboard.dashboard_state')).toBe(true);
    expect(isAllowedBuiltinAttachment('security.alert')).toBe(true);
    expect(isAllowedBuiltinAttachment('security.entity_graph')).toBe(true);
    expect(isAllowedBuiltinAttachment('observability.service-map')).toBe(true);
    expect(isAllowedBuiltinAttachment('ml.anomaly_swimlane')).toBe(true);
    expect(isAllowedBuiltinAttachment('ml.anomaly_charts')).toBe(true);
    expect(isAllowedBuiltinAttachment('ml.single_metric_viewer')).toBe(true);
  });

  it('returns false for unlisted attachment type ids', () => {
    expect(isAllowedBuiltinAttachment('not-an-attachment')).toBe(false);
    expect(isAllowedBuiltinAttachment('')).toBe(false);
    expect(isAllowedBuiltinAttachment('security.unknown')).toBe(false);
  });
});

describe('isAllowedSkillRegistration', () => {
  it('allows a skill on the built-in allow list', () => {
    expect(
      isAllowedSkillRegistration({ id: 'skill-management', basePath: 'skills/platform' })
    ).toBe(true);
  });

  it('allows an unlisted skill from the elastic-skills base path', () => {
    expect(
      isAllowedSkillRegistration({ id: 'elasticsearch-esql', basePath: ELASTIC_SKILLS_BASE_PATH })
    ).toBe(true);
  });

  it('rejects an unlisted skill outside the elastic-skills base path', () => {
    expect(
      isAllowedSkillRegistration({ id: 'elasticsearch-esql', basePath: 'skills/search' })
    ).toBe(false);
  });
});
