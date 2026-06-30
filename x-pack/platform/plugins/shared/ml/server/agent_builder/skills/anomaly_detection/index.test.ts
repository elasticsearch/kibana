/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAnomalyDetectionSkill } from '.';
import {
  AD_GET_JOB_INFO_TOOL_ID,
  AD_CREATE_JOB_TOOL_ID,
  AD_MANAGE_JOB_STATE_TOOL_ID,
  AD_UPDATE_JOB_CONFIG_TOOL_ID,
} from '../../tools/tool_ids';

describe('createAnomalyDetectionSkill', () => {
  it('returns a skill definition with the correct id and name', () => {
    const skill = createAnomalyDetectionSkill();
    expect(skill.id).toBe('ml.anomaly-detection');
    expect(skill.name).toBe('anomaly-detection');
  });

  it('uses the correct basePath for the anomaly_detection subdirectory', () => {
    const skill = createAnomalyDetectionSkill();
    expect(skill.basePath).toBe('skills/ml/anomaly_detection');
  });

  it('has a non-empty description within the 1024 character limit', () => {
    const skill = createAnomalyDetectionSkill();
    expect(skill.description).toBeTruthy();
    expect(skill.description.length).toBeLessThanOrEqual(1024);
  });

  it('has non-empty content', () => {
    const skill = createAnomalyDetectionSkill();
    expect(skill.content).toBeTruthy();
  });

  it('registers exactly 5 registry tools including platform.core.execute_esql', async () => {
    const skill = createAnomalyDetectionSkill();
    const toolIds = await skill.getRegistryTools?.();
    expect(toolIds).toHaveLength(5);
    expect(toolIds).toContain('platform.core.execute_esql');
    expect(toolIds).toContain(AD_GET_JOB_INFO_TOOL_ID);
    expect(toolIds).toContain(AD_CREATE_JOB_TOOL_ID);
    expect(toolIds).toContain(AD_MANAGE_JOB_STATE_TOOL_ID);
    expect(toolIds).toContain(AD_UPDATE_JOB_CONFIG_TOOL_ID);
  });

  it('has exactly 5 referenced content items', () => {
    const skill = createAnomalyDetectionSkill();
    expect(skill.referencedContent).toHaveLength(5);
    const names = skill.referencedContent!.map((r) => r.name);
    expect(names).toContain('esql-read-queries');
    expect(names).toContain('esql-metadata-queries');
    expect(names).toContain('esql-score-queries');
    expect(names).toContain('job-creation-recipes');
    expect(names).toContain('score-reference');
  });

  it('all referenced content uses ./references relativePath', () => {
    const skill = createAnomalyDetectionSkill();
    for (const ref of skill.referencedContent!) {
      expect(ref.relativePath).toBe('./references');
      expect(ref.content).toBeTruthy();
    }
  });

  it('has no inline tools (uses only registry tools)', () => {
    const skill = createAnomalyDetectionSkill();
    expect(skill.getInlineTools).toBeUndefined();
  });
});
