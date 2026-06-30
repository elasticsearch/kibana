/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import type { ToolRegistry } from '@kbn/agent-builder-server';
import { createSkillService } from './skill_service';

const mockPersistedSkillNotFoundError = () =>
  jest
    .requireActual<typeof import('@kbn/agent-builder-common')>('@kbn/agent-builder-common')
    .createSkillNotFoundError({ skillId: 'missing' });

jest.mock('@kbn/agent-builder-server/skills', () => {
  const actual = jest.requireActual('@kbn/agent-builder-server/skills');
  return {
    ...actual,
    validateSkillDefinition: jest.fn(async (skill) => skill),
  };
});

jest.mock('@kbn/agent-builder-server/allow_lists', () => ({
  isAllowedBuiltinSkill: jest.fn().mockReturnValue(true),
}));

jest.mock('../execution/runner/store/volumes/skills/utils', () => ({
  getSkillEntryPath: jest.fn(({ skill }) => `${skill.basePath}/${skill.name}/SKILL.md`),
}));

jest.mock('./persisted/client', () => ({
  createClient: jest.fn(() => ({
    has: jest.fn().mockResolvedValue(false),
    get: jest.fn().mockRejectedValue(mockPersistedSkillNotFoundError()),
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    bulkCreate: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteByPluginId: jest.fn(),
  })),
}));

jest.mock('../../utils/spaces', () => ({
  getCurrentSpaceId: jest.fn().mockReturnValue('default'),
}));

const createMockSkillDefinition = (overrides: Partial<SkillDefinition> = {}): SkillDefinition => ({
  id: 'test-skill-1',
  name: 'test-skill' as any,
  basePath: 'skills/platform' as any,
  description: 'A test skill',
  content: 'Skill body content',
  getRegistryTools: () => [],
  ...overrides,
});

const createMockToolRegistry = (toolIds: string[] = []): ToolRegistry =>
  ({
    has: jest.fn(async (id: string) => toolIds.includes(id)),
  } as unknown as ToolRegistry);

describe('createSkillService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setup().registerSkill', () => {
    it('registers a skill successfully', () => {
      const service = createSkillService();
      const { registerSkill } = service.setup();

      const skill = createMockSkillDefinition();
      expect(() => registerSkill(skill)).not.toThrow();
    });

    it('throws when registering a skill id not in the allow-list', () => {
      const { isAllowedBuiltinSkill } = jest.requireMock('@kbn/agent-builder-server/allow_lists');
      isAllowedBuiltinSkill.mockReturnValueOnce(false);

      const service = createSkillService();
      const { registerSkill } = service.setup();

      expect(() => registerSkill(createMockSkillDefinition({ id: 'unlisted-skill' }))).toThrow(
        'Built-in skill with id "unlisted-skill" is not in the list of allowed built-in skills.'
      );
    });

    it('throws when registering duplicate skill id', () => {
      const service = createSkillService();
      const { registerSkill } = service.setup();

      registerSkill(createMockSkillDefinition({ id: 'dup' }));
      expect(() =>
        registerSkill(createMockSkillDefinition({ id: 'dup', name: 'other' as any }))
      ).toThrow('Skill type with id dup already registered');
    });

    it('throws when registering skill with duplicate path and name', () => {
      const service = createSkillService();
      const { registerSkill } = service.setup();

      registerSkill(
        createMockSkillDefinition({ id: 'a', name: 'same' as any, basePath: 'skills/p' as any })
      );
      expect(() =>
        registerSkill(
          createMockSkillDefinition({ id: 'b', name: 'same' as any, basePath: 'skills/p' as any })
        )
      ).toThrow('Skill with path skills/p and name same already registered');
    });

    it('allows different skills with same name but different base paths', () => {
      const service = createSkillService();
      const { registerSkill } = service.setup();

      expect(() =>
        registerSkill(
          createMockSkillDefinition({
            id: 'a',
            name: 'same' as any,
            basePath: 'skills/platform' as any,
          })
        )
      ).not.toThrow();
      expect(() =>
        registerSkill(
          createMockSkillDefinition({
            id: 'b',
            name: 'same' as any,
            basePath: 'skills/security' as any,
          })
        )
      ).not.toThrow();
    });
  });

  describe('start().getRegistry', () => {
    it('returns a registry that includes registered built-in skills', async () => {
      const { createClient: mockCreateClient } = jest.requireMock('./persisted/client/client');
      mockCreateClient.mockReturnValue({
        has: jest.fn().mockResolvedValue(false),
        get: jest.fn().mockRejectedValue(mockPersistedSkillNotFoundError()),
        list: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      });

      const mockToolRegistry = createMockToolRegistry();
      const service = createSkillService();
      const { registerSkill } = service.setup();

      const skill = createMockSkillDefinition({ id: 'builtin-1' });
      registerSkill(skill);

      const mockSoClient = { get: jest.fn() } as any;
      const mockUiSettings = {
        asScopedToClient: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(false) }),
      } as any;
      const mockSavedObjects = { getScopedClient: jest.fn().mockReturnValue(mockSoClient) } as any;

      const { getRegistry } = service.start({
        elasticsearch: { client: { asInternalUser: {} } } as any,
        logger: { warn: jest.fn() } as any,
        getToolRegistry: jest.fn().mockResolvedValue(mockToolRegistry),
        uiSettings: mockUiSettings,
        savedObjects: mockSavedObjects,
      });

      const registry = await getRegistry({ request: {} as any });
      expect(await registry.has('builtin-1')).toBe(true);
    });
  });
});
