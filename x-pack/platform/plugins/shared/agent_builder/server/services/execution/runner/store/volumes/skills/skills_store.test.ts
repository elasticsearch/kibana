/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createSkillsStore, SkillsStoreImpl } from './skills_store';
import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import { FileEntryType } from '@kbn/agent-builder-server/runner/filestore';

describe('SkillsStore', () => {
  const createMockSkill = (
    overrides: Partial<InternalSkillDefinition> = {}
  ): InternalSkillDefinition => ({
    id: 'test-skill-1',
    name: 'test-skill',
    basePath: 'skills/platform',
    description: 'A test skill',
    content: 'Skill body content',
    readonly: true,
    getRegistryTools: () => [],
    referencedContentCount: 0,
    experimental: false,
    ...overrides,
  });

  describe('createSkillsStore', () => {
    it('creates a new SkillsStore instance', () => {
      const store = createSkillsStore({ skills: [] });
      expect(store).toBeInstanceOf(SkillsStoreImpl);
    });

    it('creates store with initial skills', () => {
      const skill1 = createMockSkill({ id: 'skill-1' });
      const skill2 = createMockSkill({ id: 'skill-2' });
      const store = createSkillsStore({ skills: [skill1, skill2] });

      expect(store.has('skill-1')).toBe(true);
      expect(store.has('skill-2')).toBe(true);
    });

    it('creates empty store when no skills provided', () => {
      const store = createSkillsStore({ skills: [] });
      expect(store.has('any-skill')).toBe(false);
    });
  });

  describe('constructor', () => {
    it('initializes with empty skills', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      expect(store.has('any-skill')).toBe(false);
    });

    it('adds skills to store', () => {
      const skill = createMockSkill({ id: 'skill-1' });
      const store = new SkillsStoreImpl({ skills: [skill] });
      expect(store.has('skill-1')).toBe(true);
    });
  });

  describe('add', () => {
    it('adds a skill to the store', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'new-skill' });

      store.add(skill);

      expect(store.has('new-skill')).toBe(true);
      expect(store.get('new-skill')).toEqual(skill);
    });

    it('adds skill entry to volume', async () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'volume-skill', name: 'volume-skill' });

      store.add(skill);

      const path = `/platform/volume-skill/SKILL.md`;
      expect(await store.entryExists(path)).toBe(true);
    });

    it('overwrites existing skill with same id', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill1 = createMockSkill({ id: 'same-id', description: 'First description' });
      const skill2 = createMockSkill({ id: 'same-id', description: 'Second description' });

      store.add(skill1);
      store.add(skill2);

      expect(store.get('same-id').description).toBe('Second description');
    });

    it('adds multiple skills', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill1 = createMockSkill({ id: 'skill-1' });
      const skill2 = createMockSkill({ id: 'skill-2' });
      const skill3 = createMockSkill({ id: 'skill-3' });

      store.add(skill1);
      store.add(skill2);
      store.add(skill3);

      expect(store.has('skill-1')).toBe(true);
      expect(store.has('skill-2')).toBe(true);
      expect(store.has('skill-3')).toBe(true);
    });
  });

  describe('delete', () => {
    it('returns false when skill does not exist', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      expect(store.delete('non-existent')).toBe(false);
    });

    it('returns true when skill is deleted', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'delete-skill' });
      store.add(skill);

      expect(store.delete('delete-skill')).toBe(true);
    });

    it('removes skill from store', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'remove-skill' });
      store.add(skill);

      store.delete('remove-skill');

      expect(store.has('remove-skill')).toBe(false);
    });

    it('removes skill entry from volume', async () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'volume-remove-skill', name: 'volume-remove-skill' });
      store.add(skill);

      const path = `/platform/volume-remove-skill/SKILL.md`;
      expect(await store.entryExists(path)).toBe(true);

      store.delete('volume-remove-skill');

      expect(await store.entryExists(path)).toBe(false);
    });

    it('does not affect other skills when deleting', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill1 = createMockSkill({ id: 'skill-1' });
      const skill2 = createMockSkill({ id: 'skill-2' });
      store.add(skill1);
      store.add(skill2);

      store.delete('skill-1');

      expect(store.has('skill-1')).toBe(false);
      expect(store.has('skill-2')).toBe(true);
    });
  });

  describe('has', () => {
    it('returns false for non-existent skill', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      expect(store.has('non-existent')).toBe(false);
    });

    it('returns true for existing skill', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'existing-skill' });
      store.add(skill);

      expect(store.has('existing-skill')).toBe(true);
    });

    it('returns false after deletion', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'deleted-skill' });
      store.add(skill);
      store.delete('deleted-skill');

      expect(store.has('deleted-skill')).toBe(false);
    });
  });

  describe('get', () => {
    it('throws error when skill does not exist', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      expect(() => store.get('non-existent')).toThrow('Skill with id non-existent does not exist');
    });

    it('returns the skill when it exists', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'get-skill', description: 'Get test' });
      store.add(skill);

      const retrieved = store.get('get-skill');
      expect(retrieved).toEqual(skill);
    });

    it('returns correct skill when multiple skills exist', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill1 = createMockSkill({ id: 'skill-1', name: 'skill-one' });
      const skill2 = createMockSkill({ id: 'skill-2', name: 'skill-two' });
      store.add(skill1);
      store.add(skill2);

      expect(store.get('skill-1')).toEqual(skill1);
      expect(store.get('skill-2')).toEqual(skill2);
    });
  });

  describe('typed entry accessors', () => {
    it('exposes added skill entries via entryExists + getEntry', async () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'volume-skill', name: 'volume-skill' });
      store.add(skill);

      const path = `/platform/volume-skill/SKILL.md`;
      expect(await store.entryExists(path)).toBe(true);

      const entry = await store.getEntry(path);
      expect(entry).toBeDefined();
      expect(entry?.metadata.type).toBe(FileEntryType.skill);
    });
  });

  describe('asReadonly', () => {
    it('returns a readonly interface', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ id: 'readonly-skill' });
      store.add(skill);

      const readonly = store.asReadonly();

      expect(readonly.has('readonly-skill')).toBe(true);
      expect(readonly.get('readonly-skill')).toEqual(skill);
    });

    it('does not expose add or delete methods', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const readonly = store.asReadonly();

      expect('add' in readonly).toBe(false);
      expect('delete' in readonly).toBe(false);
      expect('getVolume' in readonly).toBe(false);
    });

    it('reflects changes made to the original store', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const readonly = store.asReadonly();

      expect(readonly.has('new-skill')).toBe(false);

      const skill = createMockSkill({ id: 'new-skill' });
      store.add(skill);

      expect(readonly.has('new-skill')).toBe(true);
      expect(readonly.get('new-skill')).toEqual(skill);
    });
  });

  describe('persisted (custom) skills', () => {
    const createPersistedSkill = (
      overrides: Partial<InternalSkillDefinition> = {}
    ): InternalSkillDefinition => ({
      id: 'custom-skill-1',
      name: 'custom-skill',
      basePath: '/skills',
      description: 'A persisted custom skill',
      content: 'Custom skill content',
      readonly: false,
      getRegistryTools: () => ['tool-1'],
      referencedContentCount: 0,
      experimental: false,
      ...overrides,
    });

    it('adds a persisted skill to the store and volume', async () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createPersistedSkill();

      store.add(skill);

      expect(store.has('custom-skill-1')).toBe(true);
      expect(await store.entryExists('/custom-skill/SKILL.md')).toBe(true);
    });

    it('mounts persisted skills alongside builtin skills', async () => {
      const builtin = createMockSkill({ id: 'builtin-1', name: 'builtin-skill' });
      const persisted = createPersistedSkill({ id: 'custom-1', name: 'custom-skill' });
      const store = new SkillsStoreImpl({ skills: [builtin, persisted] });

      expect(await store.entryExists('/platform/builtin-skill/SKILL.md')).toBe(true);
      expect(await store.entryExists('/custom-skill/SKILL.md')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles skills with empty body', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({ content: '' });
      store.add(skill);
      expect(store.get('test-skill-1').content).toBe('');
    });

    it('handles skills with referenced content', () => {
      const store = new SkillsStoreImpl({ skills: [] });
      const skill = createMockSkill({
        referencedContent: [
          {
            name: 'content',
            relativePath: '.',
            content: 'Content body',
          },
        ],
      });
      expect(() => store.add(skill)).not.toThrow();
      expect(store.has('test-skill-1')).toBe(true);
    });

    it('handles rapid add and delete operations', () => {
      const store = new SkillsStoreImpl({ skills: [] });

      for (let i = 0; i < 10; i++) {
        const skill = createMockSkill({ id: `skill-${i}` });
        store.add(skill);
      }

      expect(store.has('skill-5')).toBe(true);

      for (let i = 0; i < 10; i++) {
        store.delete(`skill-${i}`);
      }

      expect(store.has('skill-0')).toBe(false);
    });
  });
});
