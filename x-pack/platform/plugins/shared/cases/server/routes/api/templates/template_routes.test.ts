/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import type { Template } from '../../../../common/types/domain/template/v1';
import { mockTemplates } from './mock_data';
import { getTemplatesRoute } from './get_templates_route';
import { getTemplateRoute } from './get_template_route';
import { getPublicTemplatesRoute } from './get_public_templates_route';
import { getPublicTemplateRoute } from './get_public_template_route';
import { postTemplateRoute } from './post_template_route';
import { putTemplateRoute } from './put_template_route';
import { patchTemplateRoute } from './patch_template_route';
import { bulkDeleteTemplatesRoute } from './bulk_delete_templates_route';
import { bulkExportTemplatesRoute } from './bulk_export_templates_route';
import { getTemplateTagsRoute } from './get_template_tags_route';
import { getTemplateCreatorsRoute } from './get_template_creators_route';
import { getPublicTemplateRoutes } from '.';

const buildDefinition = (name: string) =>
  yamlStringify({
    name,
    fields: [
      {
        control: 'INPUT_TEXT',
        name: 'test_field',
        label: 'Test Field',
        type: 'keyword',
      },
    ],
  });

const validDefinition = buildDefinition('Template Definition');

const createTestTemplates = (): Template[] => [
  {
    templateId: 'template-1',
    name: 'Template One',
    owner: 'securitySolution',
    tags: ['security', 'tag-a'],
    author: 'alice',
    definition: validDefinition,
    templateVersion: 1,
    deletedAt: null,
  },
  {
    templateId: 'template-2',
    name: 'Template Two',
    owner: 'observability',
    tags: ['observability', 'tag-a'],
    author: 'bob',
    definition: validDefinition,
    templateVersion: 1,
    deletedAt: null,
  },
  {
    templateId: 'template-3',
    name: 'Deleted Template',
    owner: 'securitySolution',
    tags: ['deleted'],
    author: 'charlie',
    definition: validDefinition,
    templateVersion: 1,
    deletedAt: '2024-01-15T10:00:00.000Z',
  },
];

const toSavedObject = (template: Template) => ({
  attributes: template,
});

const createMockCasesClient = () => ({
  templates: {
    getAllTemplates: jest.fn(async () => {
      const latestById = new Map<string, Template>();

      mockTemplates
        .filter((template) => template.deletedAt === null)
        .forEach((template) => {
          const existing = latestById.get(template.templateId);
          if (!existing || template.templateVersion > existing.templateVersion) {
            latestById.set(template.templateId, template);
          }
        });

      const templates = Array.from(latestById.values());

      return {
        templates,
        page: 1,
        perPage: 10,
        total: templates.length,
      };
    }),
    getTemplate: jest.fn(async (templateId: string, version?: string) => {
      const candidates = mockTemplates.filter(
        (template) => template.templateId === templateId && template.deletedAt === null
      );

      if (candidates.length === 0) {
        return undefined;
      }

      if (version !== undefined) {
        const match = candidates.find((template) => template.templateVersion === Number(version));
        return match ? toSavedObject(match) : undefined;
      }

      const latest = candidates.reduce((current, template) =>
        template.templateVersion > current.templateVersion ? template : current
      );

      return toSavedObject(latest);
    }),
    createTemplate: jest.fn(async (input: { name?: string; owner: string; definition: string }) => {
      const parsedDefinition = yamlParse(input.definition) as { name: string };
      const templateName = input.name ?? parsedDefinition.name;

      const newTemplate: Template = {
        templateId: `template-${Date.now()}`,
        name: templateName,
        owner: input.owner,
        definition: input.definition,
        templateVersion: 1,
        deletedAt: null,
        author: 'unknown',
      };

      mockTemplates.push(newTemplate);

      return toSavedObject(newTemplate);
    }),
    updateTemplate: jest.fn(
      async (templateId: string, input: { name?: string; owner: string; definition: string }) => {
        const candidates = mockTemplates.filter(
          (template) => template.templateId === templateId && template.deletedAt === null
        );

        if (candidates.length === 0) {
          throw new Error('template does not exist');
        }

        const latestVersion = Math.max(...candidates.map((template) => template.templateVersion));
        const parsedDefinition = yamlParse(input.definition) as { name: string };
        const templateName = input.name ?? parsedDefinition.name;

        const updatedTemplate: Template = {
          templateId,
          name: templateName,
          owner: input.owner,
          definition: input.definition,
          templateVersion: latestVersion + 1,
          deletedAt: null,
          author: 'unknown',
        };

        mockTemplates.push(updatedTemplate);

        return toSavedObject(updatedTemplate);
      }
    ),
    deleteTemplate: jest.fn(async (templateId: string) => {
      const deletedAt = new Date().toISOString();

      mockTemplates.forEach((template) => {
        if (template.templateId === templateId && template.deletedAt === null) {
          template.deletedAt = deletedAt;
        }
      });
    }),
    getTags: jest.fn(async () => {
      const nonDeleted = mockTemplates.filter((t) => t.deletedAt === null);
      const tags = nonDeleted.flatMap((t) => t.tags ?? []);
      return [...new Set(tags)].sort();
    }),
    getAuthors: jest.fn(async () => {
      const nonDeleted = mockTemplates.filter((t) => t.deletedAt === null);
      const authors = nonDeleted.map((t) => t.author).filter(Boolean);
      return [...new Set(authors)].sort();
    }),
  },
});

const createMockContext = () => ({
  cases: {
    getCasesClient: jest.fn().mockResolvedValue(createMockCasesClient()),
  },
});

const createMockResponse = () => ({
  ok: jest.fn(),
  notFound: jest.fn(),
  badRequest: jest.fn(),
  noContent: jest.fn(),
});

describe('Template Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTemplates.length = 0;
    mockTemplates.push(...createTestTemplates());
  });

  describe('GET /internal/cases/templates', () => {
    it('returns non-deleted templates by default', async () => {
      const context = createMockContext();
      const request = {
        query: { page: 1, perPage: 10, isDeleted: false },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplatesRoute.handler({ context, request, response });

      const body = response.ok.mock.calls[0][0].body;
      expect(body.templates).toHaveLength(2);
      expect(body.page).toBe(1);
      expect(body.perPage).toBe(10);
      expect(body.total).toBe(2);
      expect(body.templates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ templateId: 'template-1', name: 'Template One' }),
          expect.objectContaining({ templateId: 'template-2', name: 'Template Two' }),
        ])
      );
    });

    it('still excludes deleted templates when isDeleted is false', async () => {
      const context = createMockContext();
      const request = {
        query: { page: 1, perPage: 10, isDeleted: false },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplatesRoute.handler({ context, request, response });

      const body = response.ok.mock.calls[0][0].body;
      expect(body.templates).toHaveLength(2);
      expect(body.templates).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ templateId: 'template-3' })])
      );
    });

    it('passes all query params to the cases client', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const request = {
        query: {
          page: 2,
          perPage: 5,
          sortField: 'name',
          sortOrder: 'desc',
          search: 'test-query',
          tags: 'security',
          author: 'alice',
          isDeleted: true,
        },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplatesRoute.handler({ context, request, response });

      expect(casesClient.templates.getAllTemplates).toHaveBeenCalledWith({
        page: 2,
        perPage: 5,
        sortField: 'name',
        sortOrder: 'desc',
        search: 'test-query',
        tags: ['security'],
        author: ['alice'],
        owner: [],
        isDeleted: true,
      });
    });

    it('coerces tags, author, and owner from arrays', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const request = {
        query: {
          page: 1,
          perPage: 10,
          isDeleted: false,
          tags: ['security', 'network'],
          author: ['alice', 'bob'],
          owner: ['securitySolution', 'observability'],
        },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplatesRoute.handler({ context, request, response });

      expect(casesClient.templates.getAllTemplates).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['security', 'network'],
          author: ['alice', 'bob'],
          owner: ['securitySolution', 'observability'],
        })
      );
    });

    it('sends empty arrays for tags, author, and owner when they are not provided', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const request = {
        query: { page: 1, perPage: 10, isDeleted: false },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplatesRoute.handler({ context, request, response });

      expect(casesClient.templates.getAllTemplates).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [],
          author: [],
          owner: [],
        })
      );
    });

    it('coerces string isDeleted "true" to boolean true', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const request = {
        query: { page: 1, perPage: 10, isDeleted: 'true' },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplatesRoute.handler({ context, request, response });

      expect(casesClient.templates.getAllTemplates).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: true,
        })
      );
    });

    it('coerces page and perPage from string to number', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const request = {
        query: { page: '2', perPage: '25', isDeleted: false },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplatesRoute.handler({ context, request, response });

      expect(casesClient.templates.getAllTemplates).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          perPage: 25,
        })
      );
    });

    it('filters out invalid templates and logs warning', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

      const invalidDefinition = yamlStringify({
        name: 'Invalid Template',
        fields: [
          {
            control: 'INVALID_CONTROL',
            name: 'test_field',
            type: 'keyword',
          },
        ],
      });

      const validTemplate: Template = {
        templateId: 'valid-template',
        name: 'Valid Template',
        owner: 'securitySolution',
        definition: validDefinition,
        templateVersion: 1,
        deletedAt: null,
      };

      const invalidTemplate: Template = {
        templateId: 'invalid-template',
        name: 'Invalid Template',
        owner: 'securitySolution',
        definition: invalidDefinition,
        templateVersion: 1,
        deletedAt: null,
      };

      casesClient.templates.getAllTemplates.mockResolvedValueOnce({
        templates: [validTemplate, invalidTemplate],
        page: 1,
        perPage: 10,
        total: 2,
      });

      const request = {
        query: { page: 1, perPage: 10, isDeleted: false },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplatesRoute.handler({ context, request, response, logger });

      const body = response.ok.mock.calls[0][0].body;
      expect(body.templates).toHaveLength(1);
      expect(body.templates[0].templateId).toBe('valid-template');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping invalid template "Invalid Template"')
      );
    });
  });

  describe('GET /internal/cases/templates/tags', () => {
    it('returns unique, sorted tags from non-deleted templates', async () => {
      const context = createMockContext();
      const request = {};
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplateTagsRoute.handler({ context, request, response });

      expect(response.ok).toHaveBeenCalledWith({
        body: ['observability', 'security', 'tag-a'],
      });
    });
  });

  describe('GET /internal/cases/templates/creators', () => {
    it('returns unique, sorted creators from non-deleted templates', async () => {
      const context = createMockContext();
      const request = {};
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplateCreatorsRoute.handler({ context, request, response });

      expect(response.ok).toHaveBeenCalledWith({
        body: ['alice', 'bob'],
      });
    });
  });

  describe('GET /internal/cases/templates/{template_id}', () => {
    it('returns a template by ID', async () => {
      const context = createMockContext();
      const request = { params: { template_id: 'template-1' }, query: {} };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplateRoute.handler({ context, request, response });

      expect(response.ok).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            templateId: 'template-1',
            name: 'Template One',
            owner: 'securitySolution',
          }),
        })
      );
    });

    it('returns 404 for a non-existent template ID', async () => {
      const context = createMockContext();
      const request = { params: { template_id: 'non-existent' }, query: {} };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplateRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Template with id non-existent not found' },
      });
    });

    it('returns 404 for a soft-deleted template', async () => {
      const context = createMockContext();
      const request = { params: { template_id: 'template-3' }, query: {} };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplateRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Template with id template-3 not found' },
      });
    });

    it('returns a specific version when version query param is provided', async () => {
      // Add a second version of template-1
      mockTemplates.push({
        templateId: 'template-1',
        name: 'Template One v2',
        owner: 'securitySolution',
        definition: validDefinition,
        templateVersion: 2,
        deletedAt: null,
        author: 'alice',
      });

      const context = createMockContext();
      const request = { params: { template_id: 'template-1' }, query: { version: 1 } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getTemplateRoute.handler({ context, request, response });

      expect(response.ok).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            templateId: 'template-1',
            name: 'Template One',
            templateVersion: 1,
          }),
        })
      );
    });
  });

  describe('POST /internal/cases/templates', () => {
    it('creates a new template', async () => {
      const context = createMockContext();
      const request = {
        body: {
          owner: 'securitySolution',
          definition: buildDefinition('New Template'),
        },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await postTemplateRoute.handler({ context, request, response });

      expect(response.ok).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            name: 'New Template',
            owner: 'securitySolution',
            templateVersion: 1,
            deletedAt: null,
          }),
        })
      );
      expect(mockTemplates).toHaveLength(4);
    });

    it('returns the parsed definition in the response', async () => {
      const context = createMockContext();
      const request = {
        body: {
          owner: 'securitySolution',
          definition: buildDefinition('New Template'),
        },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await postTemplateRoute.handler({ context, request, response });

      const body = response.ok.mock.calls[0][0].body;
      expect(body.definition).toEqual({
        name: 'New Template',
        fields: [
          expect.objectContaining({
            control: 'INPUT_TEXT',
            name: 'test_field',
            type: 'keyword',
          }),
        ],
      });
    });
  });

  describe('PUT /internal/cases/templates/{template_id}', () => {
    it('fully updates a template and increments the version', async () => {
      const context = createMockContext();
      const request = {
        params: { template_id: 'template-1' },
        body: {
          owner: 'observability',
          definition: buildDefinition('Updated Template'),
        },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await putTemplateRoute.handler({ context, request, response });

      expect(response.ok).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            templateId: 'template-1',
            name: 'Updated Template',
            owner: 'observability',
            templateVersion: 2,
          }),
        })
      );
    });

    it('returns 404 for a non-existent template', async () => {
      const context = createMockContext();
      const request = {
        params: { template_id: 'non-existent' },
        body: {
          owner: 'securitySolution',
          definition: buildDefinition('Updated'),
        },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await putTemplateRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Template with id non-existent not found' },
      });
    });

    it('returns 404 for a soft-deleted template', async () => {
      const context = createMockContext();
      const request = {
        params: { template_id: 'template-3' },
        body: {
          owner: 'securitySolution',
          definition: buildDefinition('Updated'),
        },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await putTemplateRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Template with id template-3 not found' },
      });
    });
  });

  describe('PATCH /internal/cases/templates/{template_id}', () => {
    it('partially updates the definition and preserves other fields', async () => {
      const context = createMockContext();
      const request = {
        params: { template_id: 'template-1' },
        body: { definition: buildDefinition('Patched Template') },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await patchTemplateRoute.handler({ context, request, response });

      expect(response.ok).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            templateId: 'template-1',
            name: 'Patched Template',
            owner: 'securitySolution',
            templateVersion: 2,
          }),
        })
      );
    });

    it('returns 404 for a non-existent template', async () => {
      const context = createMockContext();
      const request = {
        params: { template_id: 'non-existent' },
        body: { name: 'Patched' },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await patchTemplateRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Template with id non-existent not found' },
      });
    });
  });

  // NOTE: single-template delete is implemented by calling the bulk delete endpoint with a single id.

  describe('POST /internal/cases/templates/_bulk_delete', () => {
    it('bulk soft deletes multiple templates', async () => {
      const context = createMockContext();
      const request = { body: { ids: ['template-1', 'template-2'] } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await bulkDeleteTemplatesRoute.handler({ context, request, response });

      expect(response.noContent).toHaveBeenCalled();
      expect(mockTemplates.find((t) => t.templateId === 'template-1')?.deletedAt).not.toBeNull();
      expect(mockTemplates.find((t) => t.templateId === 'template-2')?.deletedAt).not.toBeNull();
    });

    it('returns 404 when any template ID is not found', async () => {
      const context = createMockContext();
      const request = { body: { ids: ['template-1', 'non-existent'] } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await bulkDeleteTemplatesRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Templates not found: non-existent' },
      });
    });

    it('returns 400 when ids is empty', async () => {
      const context = createMockContext();
      const request = { body: { ids: [] } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await bulkDeleteTemplatesRoute.handler({ context, request, response });

      expect(response.badRequest).toHaveBeenCalledWith({
        body: { message: 'ids must be a non-empty array of template IDs' },
      });
    });
  });

  describe('POST /internal/cases/templates/_bulk_export', () => {
    it('exports templates by IDs', async () => {
      const context = createMockContext();
      const request = { body: { ids: ['template-1', 'template-2'] } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await bulkExportTemplatesRoute.handler({ context, request, response });

      const body = response.ok.mock.calls[0][0].body;
      expect(body).toHaveLength(2);
      expect(body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ templateId: 'template-1' }),
          expect.objectContaining({ templateId: 'template-2' }),
        ])
      );
    });

    it('returns 404 when any template ID is not found', async () => {
      const context = createMockContext();
      const request = { body: { ids: ['template-1', 'non-existent'] } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await bulkExportTemplatesRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Templates not found: non-existent' },
      });
    });

    it('excludes soft-deleted templates and returns 404', async () => {
      const context = createMockContext();
      const request = { body: { ids: ['template-3'] } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await bulkExportTemplatesRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Templates not found: template-3' },
      });
    });

    it('returns an empty response when ids is empty', async () => {
      const context = createMockContext();
      const request = { body: { ids: [] } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await bulkExportTemplatesRoute.handler({ context, request, response });

      expect(response.ok).toHaveBeenCalledWith(
        expect.objectContaining({
          body: [],
        })
      );
    });
  });

  describe('GET /api/cases/templates (public)', () => {
    it('returns non-deleted templates with pagination', async () => {
      const context = createMockContext();
      const request = { query: { page: 1, perPage: 10 } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getPublicTemplatesRoute.handler({ context, request, response });

      const body = response.ok.mock.calls[0][0].body;
      expect(body.templates).toHaveLength(2);
      expect(body.page).toBe(1);
      expect(body.perPage).toBe(10);
      expect(body.total).toBe(2);
    });

    it('always passes isDeleted: false to the client', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const request = { query: { page: 1, perPage: 10 } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getPublicTemplatesRoute.handler({ context, request, response });

      expect(casesClient.templates.getAllTemplates).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false })
      );
    });

    it('passes query params to the client', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const request = {
        query: {
          page: 2,
          perPage: 5,
          sortField: 'name',
          sortOrder: 'desc',
          search: 'security',
          owner: 'securitySolution',
        },
      };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getPublicTemplatesRoute.handler({ context, request, response });

      expect(casesClient.templates.getAllTemplates).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          perPage: 5,
          sortField: 'name',
          sortOrder: 'desc',
          search: 'security',
          owner: ['securitySolution'],
        })
      );
    });

    it('filters out invalid templates and logs a warning', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

      const invalidDefinition = yamlStringify({
        name: 'Bad Template',
        fields: [{ control: 'INVALID_CONTROL', name: 'f', type: 'keyword' }],
      });

      casesClient.templates.getAllTemplates.mockResolvedValueOnce({
        templates: [
          {
            templateId: 'valid',
            name: 'Valid',
            owner: 'cases',
            definition: validDefinition,
            templateVersion: 1,
            deletedAt: null,
          },
          {
            templateId: 'bad',
            name: 'Bad Template',
            owner: 'cases',
            definition: invalidDefinition,
            templateVersion: 1,
            deletedAt: null,
          },
        ],
        page: 1,
        perPage: 10,
        total: 2,
      });

      const request = { query: { page: 1, perPage: 10 } };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getPublicTemplatesRoute.handler({ context, request, response, logger });

      const body = response.ok.mock.calls[0][0].body;
      expect(body.templates).toHaveLength(1);
      expect(body.templates[0].templateId).toBe('valid');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping invalid template')
      );
    });
  });

  describe('GET /api/cases/templates/{template_id} (public)', () => {
    it('returns a template by ID', async () => {
      const context = createMockContext();
      const request = { params: { template_id: 'template-1' }, query: {} };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getPublicTemplateRoute.handler({ context, request, response });

      expect(response.ok).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            templateId: 'template-1',
            name: 'Template One',
            owner: 'securitySolution',
          }),
        })
      );
    });

    it('returns 404 for a non-existent template ID', async () => {
      const context = createMockContext();
      const request = { params: { template_id: 'non-existent' }, query: {} };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getPublicTemplateRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Template with id non-existent not found' },
      });
    });

    it('returns 404 for a soft-deleted template', async () => {
      const context = createMockContext();
      const request = { params: { template_id: 'template-3' }, query: {} };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getPublicTemplateRoute.handler({ context, request, response });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Template with id template-3 not found' },
      });
    });

    it('does not pass includeDeleted to the client', async () => {
      const context = createMockContext();
      const casesClient = await (await context.cases).getCasesClient();
      const request = { params: { template_id: 'template-1' }, query: {} };
      const response = createMockResponse();

      // @ts-expect-error: mocking necessary properties for handler logic only
      await getPublicTemplateRoute.handler({ context, request, response });

      expect(casesClient.templates.getTemplate).toHaveBeenCalledWith('template-1', undefined);
    });
  });

  describe('getPublicTemplateRoutes feature flag gating', () => {
    it('returns both public routes when templates.enabled is true', () => {
      const config = { templates: { enabled: true } } as unknown as Parameters<
        typeof getPublicTemplateRoutes
      >[0];
      const routes = getPublicTemplateRoutes(config);
      expect(routes).toHaveLength(2);
    });

    it('returns empty array when templates.enabled is false', () => {
      const config = { templates: { enabled: false } } as unknown as Parameters<
        typeof getPublicTemplateRoutes
      >[0];
      const routes = getPublicTemplateRoutes(config);
      expect(routes).toHaveLength(0);
    });
  });
});
