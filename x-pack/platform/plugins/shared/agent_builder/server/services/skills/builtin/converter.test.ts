/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import { convertBuiltinSkill } from './converter';

describe('convertBuiltinSkill', () => {
  const createMockSkillDefinition = (
    overrides: Partial<SkillDefinition> = {}
  ): SkillDefinition => ({
    id: 'test-skill',
    name: 'test-skill-name' as any,
    basePath: 'skills/platform' as any,
    description: 'A test skill',
    content: 'Skill body content',
    ...overrides,
  });

  it('converts basic skill fields', () => {
    const skill = createMockSkillDefinition();
    const result = convertBuiltinSkill(skill);

    expect(result.id).toBe('test-skill');
    expect(result.name).toBe('test-skill-name');
    expect(result.description).toBe('A test skill');
    expect(result.content).toBe('Skill body content');
    expect(result.basePath).toBe('skills/platform');
  });

  it('sets readonly to true', () => {
    const skill = createMockSkillDefinition();
    const result = convertBuiltinSkill(skill);

    expect(result.readonly).toBe(true);
  });

  it('preserves referencedContent', () => {
    const skill = createMockSkillDefinition({
      referencedContent: [
        { name: 'ref-1', relativePath: '.', content: 'Content 1' },
        { name: 'ref-2', relativePath: './queries', content: 'Content 2' },
      ],
    });
    const result = convertBuiltinSkill(skill);

    expect(result.referencedContent).toEqual([
      { name: 'ref-1', relativePath: '.', content: 'Content 1' },
      { name: 'ref-2', relativePath: './queries', content: 'Content 2' },
    ]);
  });

  it('returns empty array from getRegistryTools when skill has no getRegistryTools', () => {
    const skill = createMockSkillDefinition({ getRegistryTools: undefined });
    const result = convertBuiltinSkill(skill);

    expect(result.getRegistryTools()).toEqual([]);
  });

  it('delegates getRegistryTools to the original skill', () => {
    const skill = createMockSkillDefinition({
      getRegistryTools: () => ['tool-a', 'tool-b'] as any,
    });
    const result = convertBuiltinSkill(skill);

    expect(result.getRegistryTools()).toEqual(['tool-a', 'tool-b']);
  });

  it('preserves getInlineTools function', () => {
    const inlineToolsFn = jest.fn(async () => []);
    const skill = createMockSkillDefinition({
      getInlineTools: inlineToolsFn,
    });
    const result = convertBuiltinSkill(skill);

    expect(result.getInlineTools).toBe(inlineToolsFn);
  });

  it('sets getInlineTools to undefined when not provided', () => {
    const skill = createMockSkillDefinition({ getInlineTools: undefined });
    const result = convertBuiltinSkill(skill);

    expect(result.getInlineTools).toBeUndefined();
  });

  it('handles undefined referencedContent', () => {
    const skill = createMockSkillDefinition({ referencedContent: undefined });
    const result = convertBuiltinSkill(skill);

    expect(result.referencedContent).toBeUndefined();
  });

  it('sets experimental to false when not provided', () => {
    const skill = createMockSkillDefinition();
    const result = convertBuiltinSkill(skill);

    expect(result.experimental).toBe(false);
  });

  it('carries experimental: true when set on the skill definition', () => {
    const skill = createMockSkillDefinition({ experimental: true });
    const result = convertBuiltinSkill(skill);

    expect(result.experimental).toBe(true);
  });

  it('carries experimental: false when explicitly set to false', () => {
    const skill = createMockSkillDefinition({ experimental: false });
    const result = convertBuiltinSkill(skill);

    expect(result.experimental).toBe(false);
  });

  it('preserves uiSettingRequired', () => {
    const skill = createMockSkillDefinition({
      uiSettingRequired: 'agentBuilder:tracing:enabled',
    });
    const result = convertBuiltinSkill(skill);

    expect(result.uiSettingRequired).toBe('agentBuilder:tracing:enabled');
  });
});
