/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getSkillEntryPath,
  getSkillReferencedContentEntryPath,
  getSkillPlainText,
  createSkillEntries,
  isSkillFileEntry,
} from './utils';
import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import { FileEntryType } from '@kbn/agent-builder-server/runner/filestore';
import type { FileEntry } from '@kbn/agent-builder-server/runner/filestore';
import type { SkillFileEntry, SkillReferencedContentFileEntry } from './types';

describe('skills utils', () => {
  const createMockSkill = (
    overrides: Partial<InternalSkillDefinition> = {}
  ): InternalSkillDefinition => ({
    id: 'test-skill-1',
    name: 'test-skill',
    basePath: 'skills/platform',
    description: 'A test skill',
    content: 'This is the skill body content.',
    readonly: true,
    getRegistryTools: () => [],
    referencedContentCount: 0,
    experimental: false,
    ...overrides,
  });

  describe('getSkillEntryPath', () => {
    it('returns the correct path for a skill', () => {
      const skill = createMockSkill();
      const path = getSkillEntryPath({ skill });
      expect(path).toBe('/platform/test-skill/SKILL.md');
    });

    it('handles different base paths', () => {
      const skill = createMockSkill({
        basePath: 'skills/security/alerts/rules',
        name: 'alert-rule-skill',
      });
      const path = getSkillEntryPath({ skill });
      expect(path).toBe('/security/alerts/rules/alert-rule-skill/SKILL.md');
    });

    it('handles skills with different names', () => {
      const skill = createMockSkill({
        name: 'another-skill',
      });
      const path = getSkillEntryPath({ skill });
      expect(path).toBe('/platform/another-skill/SKILL.md');
    });
  });

  describe('getSkillReferencedContentEntryPath', () => {
    it('returns the correct path for referenced content', () => {
      const skill = createMockSkill();
      const referencedContent = {
        name: 'example-content',
        relativePath: '.',
        content: 'Content body',
      };
      const path = getSkillReferencedContentEntryPath({ skill, referencedContent });
      expect(path).toBe('/platform/test-skill/example-content.md');
    });

    it('handles referenced content in subdirectories', () => {
      const skill = createMockSkill();
      const referencedContent = {
        name: 'query-example',
        relativePath: './queries',
        content: 'Query content',
      };
      const path = getSkillReferencedContentEntryPath({ skill, referencedContent });
      expect(path).toBe('/platform/test-skill/queries/query-example.md');
    });

    it('handles different base paths', () => {
      const skill = createMockSkill({
        basePath: 'skills/observability',
        name: 'alert-skill',
      });
      const referencedContent = {
        name: 'alert-config',
        relativePath: './configs',
        content: 'Config content',
      };
      const path = getSkillReferencedContentEntryPath({ skill, referencedContent });
      expect(path).toBe('/observability/alert-skill/configs/alert-config.md');
    });
  });

  describe('getSkillPlainText', () => {
    it('returns formatted plain text with frontmatter', () => {
      const skill = createMockSkill({
        name: 'test-skill',
        description: 'A test skill description',
        content: 'This is the skill body.',
      });
      const plainText = getSkillPlainText({ skill });
      expect(plainText).toBe(`---
name: test-skill
description: A test skill description
---

This is the skill body.`);
    });

    it('handles empty body', () => {
      const skill = createMockSkill({
        content: '',
      });
      const plainText = getSkillPlainText({ skill });
      expect(plainText).toContain('name: test-skill');
      expect(plainText).toContain('description: A test skill');
      expect(plainText).toContain('---\n\n');
    });

    it('handles multiline body', () => {
      const skill = createMockSkill({
        content: 'Line 1\nLine 2\nLine 3',
      });
      const plainText = getSkillPlainText({ skill });
      expect(plainText).toContain('Line 1\nLine 2\nLine 3');
    });

    it('handles special characters in description', () => {
      const skill = createMockSkill({
        description: 'Description with "quotes" and \'apostrophes\'',
      });
      const plainText = getSkillPlainText({ skill });
      expect(plainText).toContain('description: Description with "quotes" and \'apostrophes\'');
    });
  });

  describe('createSkillEntries', () => {
    it('creates a skill file entry', () => {
      const skill = createMockSkill({
        id: 'skill-1',
        name: 'test-skill',
        description: 'Test description',
        content: 'Skill body content',
      });
      const entries = createSkillEntries(skill);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        type: 'file',
        path: '/platform/test-skill/SKILL.md',
        content: {
          plain_text: expect.stringContaining('name: test-skill'),
        },
        metadata: {
          type: FileEntryType.skill,
          id: 'skill-1',
          readonly: true,
          skill_name: 'test-skill',
          skill_description: 'Test description',
          skill_id: 'skill-1',
        },
      });
    });

    it('includes referenced content entries', () => {
      const skill = createMockSkill({
        referencedContent: [
          {
            name: 'content-1',
            relativePath: '.',
            content: 'Content 1 body',
          },
          {
            name: 'content-2',
            relativePath: './queries',
            content: 'Content 2 body',
          },
        ],
      });
      const entries = createSkillEntries(skill);
      expect(entries).toHaveLength(3); // 1 skill entry + 2 referenced content entries

      const skillEntry = entries[0];
      expect(skillEntry.metadata.type).toBe(FileEntryType.skill);

      const refContent1 = entries[1];
      expect(refContent1.metadata.type).toBe(FileEntryType.skillReferenceContent);
      expect(refContent1.path).toBe('/platform/test-skill/content-1.md');
      expect(refContent1.content.plain_text).toBe('Content 1 body');

      const refContent2 = entries[2];
      expect(refContent2.metadata.type).toBe(FileEntryType.skillReferenceContent);
      expect(refContent2.path).toBe('/platform/test-skill/queries/content-2.md');
      expect(refContent2.content.plain_text).toBe('Content 2 body');
    });

    it('calculates token count for skill entry', () => {
      const skill = createMockSkill({
        content: 'a'.repeat(100), // 100 characters = ~25 tokens
      });
      const entries = createSkillEntries(skill);
      expect(entries[0].metadata.token_count).toBeGreaterThan(0);
    });

    it('calculates token count for referenced content', () => {
      const skill = createMockSkill({
        referencedContent: [
          {
            name: 'content',
            relativePath: '.',
            content: 'b'.repeat(200), // 200 characters = ~50 tokens
          },
        ],
      });
      const entries = createSkillEntries(skill);
      expect(entries[1].metadata.token_count).toBeGreaterThan(0);
    });

    it('handles skill without referenced content', () => {
      const skill = createMockSkill({
        referencedContent: undefined,
      });
      const entries = createSkillEntries(skill);
      expect(entries).toHaveLength(1);
    });

    it('handles empty referenced content array', () => {
      const skill = createMockSkill({
        referencedContent: [],
      });
      const entries = createSkillEntries(skill);
      expect(entries).toHaveLength(1);
    });

    it('sets readonly to true for all entries', () => {
      const skill = createMockSkill({
        referencedContent: [
          {
            name: 'content',
            relativePath: '.',
            content: 'Content',
          },
        ],
      });
      const entries = createSkillEntries(skill);
      entries.forEach((entry) => {
        expect(entry.metadata.readonly).toBe(true);
      });
    });

    it('includes skill_id in referenced content metadata', () => {
      const skill = createMockSkill({
        id: 'skill-123',
        referencedContent: [
          {
            name: 'content',
            relativePath: '.',
            content: 'Content',
          },
        ],
      });
      const entries = createSkillEntries(skill);
      const refContentEntry = entries[1];
      expect(refContentEntry.metadata.skill_id).toBe('skill-123');
    });
  });

  describe('isSkillFileEntry', () => {
    it('returns true for skill file entry', () => {
      const entry: SkillFileEntry = {
        type: 'file',
        path: '/path/to/skill.md',
        content: {
          raw: {},
        },
        metadata: {
          type: FileEntryType.skill,
          id: 'skill-1',
          token_count: 100,
          readonly: true,
          skill_name: 'test-skill',
          skill_description: 'Test',
          skill_id: 'skill-1',
        },
      };
      expect(isSkillFileEntry(entry)).toBe(true);
    });

    it('returns false for tool result entry', () => {
      const entry: FileEntry = {
        type: 'file',
        path: '/path/to/result.json',
        content: {
          raw: {},
        },
        metadata: {
          type: FileEntryType.toolResult,
          id: 'result-1',
          token_count: 100,
          readonly: false,
        },
      };
      expect(isSkillFileEntry(entry)).toBe(false);
    });

    it('returns false for attachment entry', () => {
      const entry: FileEntry = {
        type: 'file',
        path: '/path/to/attachment.pdf',
        content: {
          raw: {},
        },
        metadata: {
          type: FileEntryType.attachment,
          id: 'attachment-1',
          token_count: 100,
          readonly: false,
        },
      };
      expect(isSkillFileEntry(entry)).toBe(false);
    });

    it('returns false for skill reference content entry', () => {
      const entry: SkillReferencedContentFileEntry = {
        type: 'file',
        path: '/path/to/reference.md',
        content: {
          raw: {},
        },
        metadata: {
          type: FileEntryType.skillReferenceContent,
          id: 'skill-1',
          token_count: 100,
          readonly: true,
          skill_id: 'skill-1',
        },
      };
      expect(isSkillFileEntry(entry)).toBe(false);
    });
  });
});
