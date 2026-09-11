/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ResolveMlCapabilities } from '@kbn/ml-common-types/capabilities';
import { createAnomalyDetectionSkill } from '.';

const mockResolveMlCapabilities = jest.fn() as ResolveMlCapabilities;

describe('createAnomalyDetectionSkill', () => {
  it('returns a skill definition with the correct id and name', () => {
    const skill = createAnomalyDetectionSkill(mockResolveMlCapabilities);
    expect(skill.id).toBe('ml.anomaly-detection');
    expect(skill.name).toBe('anomaly-detection');
  });

  it('is marked experimental so it requires agentBuilder:experimentalFeatures', () => {
    const skill = createAnomalyDetectionSkill(mockResolveMlCapabilities);
    expect(skill.experimental).toBe(true);
  });

  it('uses the correct basePath for the anomaly_detection subdirectory', () => {
    const skill = createAnomalyDetectionSkill(mockResolveMlCapabilities);
    expect(skill.basePath).toBe('skills/ml/anomaly_detection');
  });

  it('has a non-empty description within the 1024 character limit', () => {
    const skill = createAnomalyDetectionSkill(mockResolveMlCapabilities);
    expect(skill.description).toBeTruthy();
    expect(skill.description.length).toBeLessThanOrEqual(1024);
  });

  it('has non-empty content', () => {
    const skill = createAnomalyDetectionSkill(mockResolveMlCapabilities);
    expect(skill.content).toBeTruthy();
  });

  it('registers only platform.core.execute_esql as a registry tool', async () => {
    const skill = createAnomalyDetectionSkill(mockResolveMlCapabilities);
    const toolIds = await skill.getRegistryTools?.();
    expect(toolIds).toHaveLength(1);
    // Retained for source-data ES|QL (RCA evidence / ingest latency) as the current user.
    expect(toolIds).toContain('platform.core.execute_esql');
  });

  it('has exactly 5 referenced content items', () => {
    const skill = createAnomalyDetectionSkill(mockResolveMlCapabilities);
    expect(skill.referencedContent).toHaveLength(5);
    const names = skill.referencedContent!.map((r) => r.name);
    expect(names).toContain('esql-read-queries');
    expect(names).toContain('esql-metadata-queries');
    expect(names).toContain('esql-score-queries');
    expect(names).toContain('job-creation-recipes');
    expect(names).toContain('score-reference');
  });

  it('all referenced content uses ./references relativePath', () => {
    const skill = createAnomalyDetectionSkill(mockResolveMlCapabilities);
    for (const ref of skill.referencedContent!) {
      expect(ref.relativePath).toBe('./references');
      expect(ref.content).toBeTruthy();
    }
  });

  it('exposes 6 ML tools inline so they only load when the skill is read', async () => {
    const skill = createAnomalyDetectionSkill(mockResolveMlCapabilities);
    expect(skill.getInlineTools).toBeDefined();
    const tools = await skill.getInlineTools!();
    expect(tools).toHaveLength(6);
  });
});
