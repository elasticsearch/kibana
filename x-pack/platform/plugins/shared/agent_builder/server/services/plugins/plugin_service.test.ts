/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { ParsedPluginArchive } from '@kbn/agent-builder-common';
import type { KibanaRequest } from '@kbn/core/server';
import { createPluginsService, type PluginsServiceStart } from './plugin_service';
import type { PluginClient, PersistedPluginDefinition } from './client';
import type { SkillClient } from '../skills/persisted/client';
import type { AnalyticsService, TrackingService } from '../../telemetry';

const mockRandomUUID = jest.fn().mockReturnValue('test-plugin-uuid');
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: () => mockRandomUUID(),
}));

const mockParsePluginFromUrl = jest.fn();
const mockParsePluginFromFile = jest.fn();
jest.mock('./utils', () => ({
  parsePluginFromUrl: (...args: unknown[]) => mockParsePluginFromUrl(...args),
  parsePluginFromFile: (...args: unknown[]) => mockParsePluginFromFile(...args),
}));

const mockCreateClient = jest.fn();
jest.mock('./client', () => ({
  ...jest.requireActual('./client'),
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const mockCreateSkillClient = jest.fn();
jest.mock('../skills/persisted/client', () => ({
  createClient: (...args: unknown[]) => mockCreateSkillClient(...args),
}));

jest.mock('../../utils/spaces', () => ({
  getCurrentSpaceId: jest.fn(() => 'default'),
}));

const createMockParsedArchive = (
  overrides?: Partial<ParsedPluginArchive>
): ParsedPluginArchive => ({
  manifest: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: { name: 'Author' },
    homepage: 'https://example.com',
    repository: 'https://github.com/test/repo',
    license: 'MIT',
    keywords: ['test'],
  },
  skills: [],
  unmanagedAssets: {
    agents: [],
    hooks: [],
    mcp_servers: [],
    output_styles: [],
    lsp_servers: [],
  },
  ...overrides,
});

const createMockPersistedPlugin = (
  overrides?: Partial<PersistedPluginDefinition>
): PersistedPluginDefinition => ({
  id: 'generated-id',
  name: 'my-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  manifest: {
    author: { name: 'Author' },
    homepage: 'https://example.com',
    repository: 'https://github.com/test/repo',
    license: 'MIT',
    keywords: ['test'],
  },
  source_url: 'https://github.com/test/repo/tree/main/plugin',
  skill_ids: [],
  unmanaged_assets: {
    agents: [],
    hooks: [],
    mcp_servers: [],
    output_styles: [],
    lsp_servers: [],
  },
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

describe('PluginsService', () => {
  let start: PluginsServiceStart;
  let mockClient: jest.Mocked<PluginClient>;
  let mockSkillClient: jest.Mocked<SkillClient>;
  let mockToolRegistry: { has: jest.Mock };
  let mockAnalyticsService: jest.Mocked<Pick<AnalyticsService, 'reportPluginImported'>>;
  let mockTrackingService: jest.Mocked<Pick<TrackingService, 'trackPluginImport'>>;
  const mockRequest = {} as KibanaRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      get: jest.fn(),
      list: jest.fn(),
      has: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mockSkillClient = {
      get: jest.fn(),
      bulkGet: jest.fn(),
      list: jest.fn(),
      has: jest.fn(),
      create: jest.fn(),
      bulkCreate: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByPluginId: jest.fn(),
    };

    mockToolRegistry = {
      has: jest.fn().mockResolvedValue(true),
    };

    mockAnalyticsService = {
      reportPluginImported: jest.fn(),
    };

    mockTrackingService = {
      trackPluginImport: jest.fn(),
    };

    mockCreateClient.mockReturnValue(mockClient);
    mockCreateSkillClient.mockReturnValue(mockSkillClient);

    const mockElasticsearch = {
      client: {
        asScoped: jest.fn(() => ({
          asInternalUser: {},
        })),
      },
    };

    const service = createPluginsService();
    service.setup({ skillsSetup: { registerSkill: jest.fn() } });
    start = service.start({
      logger: loggerMock.create(),
      elasticsearch: mockElasticsearch as any,
      getToolRegistry: jest.fn().mockResolvedValue(mockToolRegistry),
      config: {
        enabled: true,
        githubBaseUrl: 'https://github.com',
        topSnippets: { numSnippets: 2, numWords: 750 },
        tracing: {
          exporters: [],
          scheduledDelay: 1000,
          opik_distributed_tracing: false,
        },
      },
      analyticsService: mockAnalyticsService as unknown as AnalyticsService,
      trackingService: mockTrackingService as unknown as TrackingService,
    });
  });

  describe('getRegistry', () => {
    it('returns a registry that queries both builtin and persisted providers', async () => {
      mockClient.has.mockResolvedValue(false);
      const registry = start.getRegistry({ request: mockRequest });
      expect(registry).toBeDefined();
      expect(typeof registry.get).toBe('function');
      expect(typeof registry.list).toBe('function');
      expect(typeof registry.findByName).toBe('function');
    });
  });

  describe('installPlugin', () => {
    const archiveWithSkills = createMockParsedArchive({
      skills: [
        {
          dirName: 'pdf-processor',
          meta: {
            name: 'PDF Processor',
            description: 'Processes PDFs',
            allowedTools: ['tool-1', 'tool-2'],
          },
          content: 'Skill instructions for PDF.',
          referencedFiles: [{ relativePath: 'schema.json', content: '{}' }],
        },
        {
          dirName: 'code-reviewer',
          meta: {},
          content: 'Review code.',
          referencedFiles: [],
        },
      ],
    });

    describe('from URL', () => {
      it('parses the URL, creates skills and the plugin record, and returns it', async () => {
        const persistedPlugin = createMockPersistedPlugin({
          skill_ids: ['my-plugin-pdf-processor', 'my-plugin-code-reviewer'],
        });

        mockParsePluginFromUrl.mockResolvedValue(archiveWithSkills);
        mockClient.findByName.mockResolvedValue(undefined);
        mockClient.create.mockResolvedValue(persistedPlugin);
        mockSkillClient.bulkCreate.mockResolvedValue([]);

        const result = await start.installPlugin({
          request: mockRequest,
          source: { type: 'url', url: 'https://github.com/test/repo/tree/main/plugin' },
        });

        expect(mockParsePluginFromUrl).toHaveBeenCalledWith(
          'https://github.com/test/repo/tree/main/plugin',
          { githubBaseUrl: 'https://github.com' }
        );

        expect(mockClient.findByName).toHaveBeenCalledWith('my-plugin');

        expect(mockSkillClient.bulkCreate).toHaveBeenCalledTimes(1);
        expect(mockSkillClient.bulkCreate).toHaveBeenCalledWith([
          {
            id: 'my-plugin-pdf-processor',
            name: 'PDF Processor',
            base_path: '/skills/my-plugin',
            description: 'Processes PDFs',
            content: 'Skill instructions for PDF.',
            referenced_content: [
              { name: 'schema.json', relativePath: 'schema.json', content: '{}' },
            ],
            tool_ids: ['tool-1', 'tool-2'],
            plugin_id: 'test-plugin-uuid',
          },
          {
            id: 'my-plugin-code-reviewer',
            name: 'code-reviewer',
            base_path: '/skills/my-plugin',
            description: '',
            content: 'Review code.',
            referenced_content: [],
            tool_ids: [],
            plugin_id: 'test-plugin-uuid',
          },
        ]);

        expect(mockClient.create).toHaveBeenCalledWith({
          id: 'test-plugin-uuid',
          name: 'my-plugin',
          version: '1.0.0',
          description: 'A test plugin',
          manifest: {
            author: { name: 'Author' },
            homepage: 'https://example.com',
            repository: 'https://github.com/test/repo',
            license: 'MIT',
            keywords: ['test'],
          },
          source_url: 'https://github.com/test/repo/tree/main/plugin',
          skill_ids: ['my-plugin-pdf-processor', 'my-plugin-code-reviewer'],
          unmanaged_assets: archiveWithSkills.unmanagedAssets,
        });

        expect(result).toBe(persistedPlugin);
      });

      it('defaults version to 0.0.0 when manifest has no version', async () => {
        const parsedArchive = createMockParsedArchive({
          manifest: { name: 'no-version-plugin' },
        });

        mockParsePluginFromUrl.mockResolvedValue(parsedArchive);
        mockClient.findByName.mockResolvedValue(undefined);
        mockClient.create.mockResolvedValue(createMockPersistedPlugin());

        await start.installPlugin({
          request: mockRequest,
          source: { type: 'url', url: 'https://example.com/plugin.zip' },
        });

        expect(mockClient.create).toHaveBeenCalledWith(
          expect.objectContaining({
            version: '0.0.0',
            description: '',
          })
        );
      });

      it('throws BadRequestError when a plugin with the same name already exists', async () => {
        mockParsePluginFromUrl.mockResolvedValue(createMockParsedArchive());
        mockClient.findByName.mockResolvedValue(
          createMockPersistedPlugin({ id: 'existing-id', version: '0.9.0' })
        );

        try {
          await start.installPlugin({
            request: mockRequest,
            source: { type: 'url', url: 'https://example.com/plugin.zip' },
          });
          fail('Expected error to be thrown');
        } catch (e) {
          expect((e as Error).message).toMatch(/already installed/);
        }

        expect(mockClient.create).not.toHaveBeenCalled();
        expect(mockSkillClient.bulkCreate).not.toHaveBeenCalled();
      });

      it('propagates errors from parsePluginFromUrl', async () => {
        mockParsePluginFromUrl.mockRejectedValue(new Error('Download failed'));

        await expect(
          start.installPlugin({
            request: mockRequest,
            source: { type: 'url', url: 'https://example.com/bad.zip' },
          })
        ).rejects.toThrow('Download failed');
      });
    });

    describe('from file', () => {
      it('parses the local file, creates skills and the plugin record without source_url', async () => {
        const persistedPlugin = createMockPersistedPlugin({
          source_url: undefined,
          skill_ids: ['my-plugin-pdf-processor', 'my-plugin-code-reviewer'],
        });

        mockParsePluginFromFile.mockResolvedValue(archiveWithSkills);
        mockClient.findByName.mockResolvedValue(undefined);
        mockClient.create.mockResolvedValue(persistedPlugin);
        mockSkillClient.bulkCreate.mockResolvedValue([]);

        const result = await start.installPlugin({
          request: mockRequest,
          source: { type: 'file', filePath: '/tmp/plugin.zip' },
        });

        expect(mockParsePluginFromFile).toHaveBeenCalledWith('/tmp/plugin.zip');
        expect(mockParsePluginFromUrl).not.toHaveBeenCalled();

        expect(mockSkillClient.bulkCreate).toHaveBeenCalledTimes(1);

        expect(mockClient.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'my-plugin',
            source_url: undefined,
            skill_ids: ['my-plugin-pdf-processor', 'my-plugin-code-reviewer'],
          })
        );

        expect(result).toBe(persistedPlugin);
      });

      it('throws BadRequestError when a plugin with the same name already exists', async () => {
        mockParsePluginFromFile.mockResolvedValue(createMockParsedArchive());
        mockClient.findByName.mockResolvedValue(
          createMockPersistedPlugin({ id: 'existing-id', version: '0.9.0' })
        );

        await expect(
          start.installPlugin({
            request: mockRequest,
            source: { type: 'file', filePath: '/tmp/plugin.zip' },
          })
        ).rejects.toThrow(/already installed/);

        expect(mockClient.create).not.toHaveBeenCalled();
        expect(mockSkillClient.bulkCreate).not.toHaveBeenCalled();
      });

      it('propagates errors from parsePluginFromFile', async () => {
        mockParsePluginFromFile.mockRejectedValue(new Error('Invalid zip'));

        await expect(
          start.installPlugin({
            request: mockRequest,
            source: { type: 'file', filePath: '/tmp/bad.zip' },
          })
        ).rejects.toThrow('Invalid zip');
      });
    });

    describe('with pluginName override', () => {
      it('uses the provided pluginName instead of the manifest name', async () => {
        const persistedPlugin = createMockPersistedPlugin({
          name: 'custom-name',
          skill_ids: ['custom-name-pdf-processor', 'custom-name-code-reviewer'],
        });

        mockParsePluginFromUrl.mockResolvedValue(archiveWithSkills);
        mockClient.findByName.mockResolvedValue(undefined);
        mockClient.create.mockResolvedValue(persistedPlugin);
        mockSkillClient.bulkCreate.mockResolvedValue([]);

        const result = await start.installPlugin({
          request: mockRequest,
          source: { type: 'url', url: 'https://example.com/plugin.zip' },
          pluginName: 'custom-name',
        });

        expect(mockClient.findByName).toHaveBeenCalledWith('custom-name');

        expect(mockSkillClient.bulkCreate).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: 'custom-name-pdf-processor',
              plugin_id: 'test-plugin-uuid',
            }),
            expect.objectContaining({
              id: 'custom-name-code-reviewer',
              plugin_id: 'test-plugin-uuid',
            }),
          ])
        );

        expect(mockClient.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'custom-name',
            skill_ids: ['custom-name-pdf-processor', 'custom-name-code-reviewer'],
          })
        );

        expect(result).toBe(persistedPlugin);
      });
    });

    describe('allowed-tools propagation', () => {
      it('maps allowedTools from skill meta to tool_ids in the create request', async () => {
        const archive = createMockParsedArchive({
          skills: [
            {
              dirName: 'with-tools',
              meta: { name: 'With Tools', description: 'Has tools', allowedTools: ['x', 'y'] },
              content: 'Content.',
              referencedFiles: [],
            },
            {
              dirName: 'no-tools',
              meta: { name: 'No Tools', description: 'No tools' },
              content: 'Content.',
              referencedFiles: [],
            },
          ],
        });

        mockParsePluginFromUrl.mockResolvedValue(archive);
        mockClient.findByName.mockResolvedValue(undefined);
        mockClient.create.mockResolvedValue(createMockPersistedPlugin());
        mockSkillClient.bulkCreate.mockResolvedValue([]);

        await start.installPlugin({
          request: mockRequest,
          source: { type: 'url', url: 'https://example.com/plugin.zip' },
        });

        expect(mockSkillClient.bulkCreate).toHaveBeenCalledWith([
          expect.objectContaining({ id: 'my-plugin-with-tools', tool_ids: ['x', 'y'] }),
          expect.objectContaining({ id: 'my-plugin-no-tools', tool_ids: [] }),
        ]);
      });

      it('throws when allowedTools references tools that do not exist', async () => {
        const archive = createMockParsedArchive({
          skills: [
            {
              dirName: 'bad-tools',
              meta: {
                name: 'Bad Tools',
                description: 'References missing tools',
                allowedTools: ['existing-tool', 'missing-tool'],
              },
              content: 'Content.',
              referencedFiles: [],
            },
          ],
        });

        mockToolRegistry.has.mockImplementation(async (id: string) => id === 'existing-tool');
        mockParsePluginFromUrl.mockResolvedValue(archive);
        mockClient.findByName.mockResolvedValue(undefined);

        await expect(
          start.installPlugin({
            request: mockRequest,
            source: { type: 'url', url: 'https://example.com/plugin.zip' },
          })
        ).rejects.toThrow(/missing-tool/);

        expect(mockSkillClient.bulkCreate).not.toHaveBeenCalled();
        expect(mockClient.create).not.toHaveBeenCalled();
      });

      describe('telemetry', () => {
        it('reports PluginImported with sourceType "url" when installing from a URL', async () => {
          mockParsePluginFromUrl.mockResolvedValue(archiveWithSkills);
          mockClient.findByName.mockResolvedValue(undefined);
          mockClient.create.mockResolvedValue(
            createMockPersistedPlugin({ id: 'created-plugin-id' })
          );
          mockSkillClient.bulkCreate.mockResolvedValue([]);

          await start.installPlugin({
            request: mockRequest,
            source: { type: 'url', url: 'https://example.com/plugin.zip' },
          });

          expect(mockAnalyticsService.reportPluginImported).toHaveBeenCalledWith({
            pluginId: 'created-plugin-id',
            sourceType: 'url',
            skillCount: 2,
          });
          expect(mockTrackingService.trackPluginImport).toHaveBeenCalledWith('url');
        });

        it('reports PluginImported with sourceType "file" when installing from a file', async () => {
          mockParsePluginFromFile.mockResolvedValue(archiveWithSkills);
          mockClient.findByName.mockResolvedValue(undefined);
          mockClient.create.mockResolvedValue(
            createMockPersistedPlugin({ id: 'created-plugin-id' })
          );
          mockSkillClient.bulkCreate.mockResolvedValue([]);

          await start.installPlugin({
            request: mockRequest,
            source: { type: 'file', filePath: '/tmp/plugin.zip' },
          });

          expect(mockAnalyticsService.reportPluginImported).toHaveBeenCalledWith({
            pluginId: 'created-plugin-id',
            sourceType: 'file',
            skillCount: 2,
          });
          expect(mockTrackingService.trackPluginImport).toHaveBeenCalledWith('file');
        });

        it('does not throw when trackingService is undefined', async () => {
          const mockElasticsearch = {
            client: {
              asScoped: jest.fn(() => ({
                asInternalUser: {},
              })),
            },
          };

          const service = createPluginsService();
          service.setup({ skillsSetup: { registerSkill: jest.fn() } });
          const startWithoutTracking = service.start({
            logger: loggerMock.create(),
            elasticsearch: mockElasticsearch as any,
            getToolRegistry: jest.fn().mockResolvedValue(mockToolRegistry),
            config: {
              enabled: true,
              githubBaseUrl: 'https://github.com',
              topSnippets: { numSnippets: 2, numWords: 750 },
              tracing: {
                exporters: [],
                scheduledDelay: 1000,
                opik_distributed_tracing: false,
              },
            },
            analyticsService: mockAnalyticsService as unknown as AnalyticsService,
          });

          mockParsePluginFromUrl.mockResolvedValue(archiveWithSkills);
          mockClient.findByName.mockResolvedValue(undefined);
          mockClient.create.mockResolvedValue(
            createMockPersistedPlugin({ id: 'created-plugin-id' })
          );
          mockSkillClient.bulkCreate.mockResolvedValue([]);

          await expect(
            startWithoutTracking.installPlugin({
              request: mockRequest,
              source: { type: 'url', url: 'https://example.com/plugin.zip' },
            })
          ).resolves.toBeDefined();
        });

        it('does not report PluginImported when install fails (existing plugin)', async () => {
          mockParsePluginFromUrl.mockResolvedValue(archiveWithSkills);
          mockClient.findByName.mockResolvedValue(
            createMockPersistedPlugin({ id: 'existing-id', version: '0.9.0' })
          );

          await expect(
            start.installPlugin({
              request: mockRequest,
              source: { type: 'url', url: 'https://example.com/plugin.zip' },
            })
          ).rejects.toThrow(/already installed/);

          expect(mockAnalyticsService.reportPluginImported).not.toHaveBeenCalled();
          expect(mockTrackingService.trackPluginImport).not.toHaveBeenCalled();
        });
      });

      it('succeeds when skills have no allowedTools', async () => {
        const archive = createMockParsedArchive({
          skills: [
            {
              dirName: 'simple',
              meta: { name: 'Simple', description: 'No tools' },
              content: 'Content.',
              referencedFiles: [],
            },
          ],
        });

        mockParsePluginFromUrl.mockResolvedValue(archive);
        mockClient.findByName.mockResolvedValue(undefined);
        mockClient.create.mockResolvedValue(createMockPersistedPlugin());
        mockSkillClient.bulkCreate.mockResolvedValue([]);

        await start.installPlugin({
          request: mockRequest,
          source: { type: 'url', url: 'https://example.com/plugin.zip' },
        });

        expect(mockToolRegistry.has).not.toHaveBeenCalled();
        expect(mockSkillClient.bulkCreate).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('deletePlugin', () => {
    it('deletes associated skills by plugin name, then deletes via registry', async () => {
      mockClient.has.mockResolvedValue(true);
      mockClient.get.mockResolvedValue(
        createMockPersistedPlugin({ id: 'plugin-1', name: 'my-plugin' })
      );
      mockSkillClient.deleteByPluginId.mockResolvedValue(undefined);
      mockClient.delete.mockResolvedValue(undefined);

      await start.deletePlugin({ request: mockRequest, pluginId: 'plugin-1' });

      expect(mockSkillClient.deleteByPluginId).toHaveBeenCalledWith('plugin-1');
      expect(mockClient.delete).toHaveBeenCalledWith('plugin-1');
    });

    it('propagates errors when plugin is not found', async () => {
      mockClient.has.mockResolvedValue(false);

      await expect(
        start.deletePlugin({ request: mockRequest, pluginId: 'missing-id' })
      ).rejects.toThrow(/not found/i);

      expect(mockSkillClient.deleteByPluginId).not.toHaveBeenCalled();
      expect(mockClient.delete).not.toHaveBeenCalled();
    });
  });
});
