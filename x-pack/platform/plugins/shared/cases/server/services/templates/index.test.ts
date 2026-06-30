/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stringify as yamlStringify } from 'yaml';
import { elasticsearchServiceMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { serializerMock } from '@kbn/core-saved-objects-base-server-mocks';
import type { SavedObject, SavedObjectsFindResponse } from '@kbn/core/server';
import type {
  SavedObjectsRawDocSource,
  SavedObjectsSearchResponse,
} from '@kbn/core-saved-objects-api-server';
import type { Template } from '../../../common/types/domain/template/v1';
import { CASE_TEMPLATE_SAVED_OBJECT } from '../../../common/constants';
import { TemplatesService } from '.';

const buildDefinition = (name: string, extras?: { description?: string; tags?: string[] }) =>
  yamlStringify({
    name,
    ...(extras?.description ? { description: extras.description } : {}),
    ...(extras?.tags ? { tags: extras.tags } : {}),
    fields: [
      {
        control: 'INPUT_TEXT',
        name: 'field_one',
        type: 'keyword',
      },
    ],
  });

/**
 * Creates a mock ES search response with hits from an array of saved objects.
 */
const createMockSearchResponse = (
  savedObjects: Array<SavedObject<Template>>,
  totalOverride?: number
) =>
  ({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: {
      total: { value: totalOverride ?? savedObjects.length, relation: 'eq' },
      max_score: null,
      hits: savedObjects.map((so) => ({ _id: so.id, _index: '.kibana_cases' })),
    },
  } as unknown as SavedObjectsSearchResponse<SavedObjectsRawDocSource, unknown>);

/**
 * Creates a mock Template saved object.
 */
const createTemplateSO = (
  id: string,
  attrs: Partial<Template> & Pick<Template, 'name' | 'templateId'>
): SavedObject<Template> =>
  ({
    id,
    attributes: {
      templateVersion: 1,
      deletedAt: null,
      owner: 'securitySolution',
      definition: '',
      author: 'unknown',
      ...attrs,
    } as Template,
  } as SavedObject<Template>);

describe('TemplatesService', () => {
  const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
  const savedObjectsSerializer = serializerMock.create();
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  // Spy on the analytics v2 refresh hook so the per-write-path assertions
  // can verify it fires without any wiring.
  const refreshAnalyticsV2DataView = jest.fn();

  const createService = () =>
    new TemplatesService({
      unsecuredSavedObjectsClient,
      savedObjectsSerializer,
      esClient,
      namespace: 'default',
      refreshAnalyticsV2DataView,
    });

  /** Default getAllTemplates params — override individual fields as needed */
  const defaultFindParams = {
    page: 1,
    perPage: 10,
    isDeleted: false,
    tags: [] as string[],
    author: [] as string[],
    owner: [] as string[],
    sortField: 'name' as const,
    sortOrder: 'asc' as const,
    search: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllTemplates', () => {
    it('returns templates parsed from search hits', async () => {
      const service = createService();
      const so1 = createTemplateSO('so-1', { templateId: 't-1', name: 'Template A' });
      const so2 = createTemplateSO('so-2', { templateId: 't-2', name: 'Template B' });

      unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([so1, so2]));
      savedObjectsSerializer.rawToSavedObject.mockReturnValueOnce(so1).mockReturnValueOnce(so2);

      const result = await service.getAllTemplates({
        page: 1,
        perPage: 10,
        isDeleted: false,
        tags: [],
        author: [],
        owner: [],
        sortField: 'templateId',
        sortOrder: 'asc',
        search: '',
      });

      expect(unsecuredSavedObjectsClient.search).toHaveBeenCalled();
      expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 0,
          size: 10,
          sort: [
            {
              [`${CASE_TEMPLATE_SAVED_OBJECT}.templateId`]: {
                order: 'asc',
                missing: '_last',
              },
            },
          ],
        })
      );
      expect(savedObjectsSerializer.rawToSavedObject).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        templates: [
          { ...so1.attributes, fieldSearchMatches: false },
          { ...so2.attributes, fieldSearchMatches: false },
        ],
        page: 1,
        perPage: 10,
        total: 2,
      });
    });

    it('returns an empty list when no templates exist', async () => {
      const service = createService();
      unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

      const result = await service.getAllTemplates({ ...defaultFindParams });

      expect(result).toEqual({ templates: [], page: 1, perPage: 10, total: 0 });
    });

    describe('sorting', () => {
      it('passes sort by name ascending to ES by default', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({ ...defaultFindParams });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: expect.arrayContaining([
              {
                [`${CASE_TEMPLATE_SAVED_OBJECT}.name`]: {
                  order: 'asc',
                  missing: '_last',
                },
              },
            ]),
          })
        );
      });

      it('passes sort by name descending to ES', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          sortField: 'name',
          sortOrder: 'desc',
        });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: expect.arrayContaining([
              {
                [`${CASE_TEMPLATE_SAVED_OBJECT}.name`]: {
                  order: 'desc',
                  missing: '_last',
                },
              },
            ]),
          })
        );
      });

      it('passes sort by templateVersion to ES', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          sortField: 'templateVersion',
          sortOrder: 'asc',
        });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: expect.arrayContaining([
              {
                [`${CASE_TEMPLATE_SAVED_OBJECT}.templateVersion`]: {
                  order: 'asc',
                  missing: '_last',
                },
              },
            ]),
          })
        );
      });

      it('returns templates in the order ES provides', async () => {
        const service = createService();
        const soAlpha = createTemplateSO('so-a', { templateId: 't-a', name: 'Alpha' });
        const soBeta = createTemplateSO('so-b', { templateId: 't-b', name: 'Beta' });
        const soGamma = createTemplateSO('so-g', { templateId: 't-g', name: 'Gamma' });

        unsecuredSavedObjectsClient.search.mockResolvedValue(
          createMockSearchResponse([soAlpha, soBeta, soGamma])
        );
        savedObjectsSerializer.rawToSavedObject
          .mockReturnValueOnce(soAlpha)
          .mockReturnValueOnce(soBeta)
          .mockReturnValueOnce(soGamma);

        const result = await service.getAllTemplates({ ...defaultFindParams });

        expect(result.templates.map((t) => t.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
      });
    });

    describe('pagination', () => {
      it('passes from and size to ES for page 1', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          page: 1,
          perPage: 10,
        });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 0,
            size: 10,
          })
        );
      });

      it('passes correct from for page 2', async () => {
        const service = createService();
        const soC = createTemplateSO('so-2', { templateId: 't-2', name: 'Template C' });
        const soD = createTemplateSO('so-3', { templateId: 't-3', name: 'Template D' });

        unsecuredSavedObjectsClient.search.mockResolvedValue(
          createMockSearchResponse([soC, soD], 5)
        );
        savedObjectsSerializer.rawToSavedObject.mockReturnValueOnce(soC).mockReturnValueOnce(soD);

        const result = await service.getAllTemplates({
          ...defaultFindParams,
          page: 2,
          perPage: 2,
        });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 2,
            size: 2,
          })
        );
        expect(result.total).toBe(5);
        expect(result.page).toBe(2);
        expect(result.perPage).toBe(2);
        expect(result.templates).toHaveLength(2);
        expect(result.templates.map((t) => t.name)).toEqual(['Template C', 'Template D']);
      });

      it('returns the last partial page correctly', async () => {
        const service = createService();
        const soE = createTemplateSO('so-4', { templateId: 't-4', name: 'Template E' });

        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([soE], 5));
        savedObjectsSerializer.rawToSavedObject.mockReturnValueOnce(soE);

        const result = await service.getAllTemplates({
          ...defaultFindParams,
          page: 3,
          perPage: 2,
        });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 4,
            size: 2,
          })
        );
        expect(result.templates).toHaveLength(1);
        expect(result.templates[0].name).toBe('Template E');
      });

      it('returns empty templates for a page beyond total', async () => {
        const service = createService();

        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([], 5));

        const result = await service.getAllTemplates({
          ...defaultFindParams,
          page: 10,
          perPage: 2,
        });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 18,
            size: 2,
          })
        );
        expect(result.templates).toHaveLength(0);
        expect(result.total).toBe(5);
      });
    });

    describe('ES query construction', () => {
      it('passes search term as wildcard + match_phrase in must clause', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          search: 'my-search',
        });

        const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
        const query = searchCall?.query as { bool: { must?: unknown[] } };
        expect(query.bool.must).toBeDefined();
        expect(query.bool.must).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              bool: expect.objectContaining({
                should: expect.arrayContaining([
                  expect.objectContaining({
                    wildcard: expect.objectContaining({
                      [`${CASE_TEMPLATE_SAVED_OBJECT}.name`]: expect.objectContaining({
                        value: '*my-search*',
                        case_insensitive: true,
                      }),
                    }),
                  }),
                  expect.objectContaining({
                    match_phrase: expect.objectContaining({
                      [`${CASE_TEMPLATE_SAVED_OBJECT}.description`]: 'my-search',
                    }),
                  }),
                  expect.objectContaining({
                    nested: expect.objectContaining({
                      path: `${CASE_TEMPLATE_SAVED_OBJECT}.fieldNames`,
                      query: expect.objectContaining({
                        bool: expect.objectContaining({
                          should: expect.arrayContaining([
                            expect.objectContaining({
                              wildcard: expect.objectContaining({
                                [`${CASE_TEMPLATE_SAVED_OBJECT}.fieldNames.name`]:
                                  expect.objectContaining({
                                    value: '*my-search*',
                                    case_insensitive: true,
                                  }),
                              }),
                            }),
                            expect.objectContaining({
                              match: expect.objectContaining({
                                [`${CASE_TEMPLATE_SAVED_OBJECT}.fieldNames.label`]: 'my-search',
                              }),
                            }),
                          ]),
                          minimum_should_match: 1,
                        }),
                      }),
                    }),
                  }),
                ]),
                minimum_should_match: 1,
              }),
            }),
          ])
        );
      });

      it('does not include must clause when search is empty', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({ ...defaultFindParams });

        const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
        const query = searchCall?.query as { bool: { must?: unknown[] } };
        expect(query.bool.must).toBeUndefined();
      });

      it('passes tags as KQL filter when provided', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          tags: ['security', 'network'],
        });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalled();
        const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
        const query = searchCall?.query as { bool: { filter?: unknown[] } };
        // Should have at least 2 filters: deletedAt + tags
        expect(query.bool.filter!.length).toBeGreaterThanOrEqual(2);
      });

      it('passes author as KQL filter when provided', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          author: ['alice', 'bob'],
        });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalled();
        const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
        const query = searchCall?.query as { bool: { filter?: unknown[] } };
        // Should have at least 2 filters: deletedAt + author
        expect(query.bool.filter!.length).toBeGreaterThanOrEqual(2);
      });

      it('passes owner as KQL filter when provided', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          owner: ['securitySolution', 'observability'],
        });

        expect(unsecuredSavedObjectsClient.search).toHaveBeenCalled();
        const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
        const query = searchCall?.query as { bool: { filter?: unknown[] } };
        // Should have at least 2 filters: deletedAt + owner
        expect(query.bool.filter!.length).toBeGreaterThanOrEqual(2);
      });

      it('omits deletedAt filter when isDeleted is true', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          isDeleted: true,
        });

        const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
        const query = searchCall?.query as { bool: { filter?: unknown[] } };
        // Only isLatest filter remains (deletedAt is omitted when isDeleted is true)
        expect(query.bool.filter).toHaveLength(1);
        expect(query.bool.filter).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              bool: expect.objectContaining({
                should: expect.arrayContaining([
                  expect.objectContaining({
                    match: expect.objectContaining({
                      [`${CASE_TEMPLATE_SAVED_OBJECT}.isLatest`]: true,
                    }),
                  }),
                ]),
              }),
            }),
          ])
        );
      });

      it('adds isEnabled:true filter when isEnabled is true', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          isEnabled: true,
        });

        const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
        const query = searchCall?.query as { bool: { filter?: unknown[] } };
        expect(query.bool.filter).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              bool: expect.objectContaining({
                should: expect.arrayContaining([
                  expect.objectContaining({
                    match: expect.objectContaining({
                      [`${CASE_TEMPLATE_SAVED_OBJECT}.isEnabled`]: true,
                    }),
                  }),
                ]),
              }),
            }),
          ])
        );
      });

      it('adds isEnabled:false filter when isEnabled is false', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({
          ...defaultFindParams,
          isEnabled: false,
        });

        const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
        const query = searchCall?.query as { bool: { filter?: unknown[] } };
        expect(query.bool.filter).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              bool: expect.objectContaining({
                should: expect.arrayContaining([
                  expect.objectContaining({
                    match: expect.objectContaining({
                      [`${CASE_TEMPLATE_SAVED_OBJECT}.isEnabled`]: false,
                    }),
                  }),
                ]),
              }),
            }),
          ])
        );
      });

      it('omits isEnabled filter when isEnabled is undefined', async () => {
        const service = createService();
        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([]));

        await service.getAllTemplates({ ...defaultFindParams });

        const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
        const query = searchCall?.query as { bool: { filter?: unknown[] } };
        const filterStr = JSON.stringify(query.bool.filter);
        expect(filterStr).not.toContain('isEnabled');
      });
    });

    describe('fieldSearchMatches enrichment', () => {
      it('sets fieldSearchMatches to true when search matches a fieldName', async () => {
        const service = createService();
        const soMatch = createTemplateSO('so-match', {
          templateId: 't-match',
          name: 'Matching Template',
          fieldNames: [
            { name: 'severity', label: 'Severity', type: 'keyword', control: 'TEXT' },
            { name: 'hostname', label: 'Hostname', type: 'keyword', control: 'TEXT' },
          ],
        });
        const soNoMatch = createTemplateSO('so-nomatch', {
          templateId: 't-nomatch',
          name: 'No Match Template',
          fieldNames: [
            { name: 'effort', label: 'Effort', type: 'keyword', control: 'TEXT' },
            { name: 'details', label: 'Details', type: 'keyword', control: 'TEXT' },
          ],
        });

        unsecuredSavedObjectsClient.search.mockResolvedValue(
          createMockSearchResponse([soMatch, soNoMatch])
        );
        savedObjectsSerializer.rawToSavedObject
          .mockReturnValueOnce(soMatch)
          .mockReturnValueOnce(soNoMatch);

        const result = await service.getAllTemplates({
          ...defaultFindParams,
          search: 'host',
        });

        // Sorted by name: "Matching Template" (index 0), "No Match Template" (index 1)
        expect(result.templates[0].fieldSearchMatches).toBe(true);
        expect(result.templates[1].fieldSearchMatches).toBe(false);
      });

      it('is case-insensitive when matching fieldNames', async () => {
        const service = createService();
        const so = createTemplateSO('so-1', {
          templateId: 't-1',
          name: 'Template',
          fieldNames: [
            { name: 'HostName', label: 'HostName', type: 'keyword', control: 'TEXT' },
            { name: 'Severity', label: 'Severity', type: 'keyword', control: 'TEXT' },
          ],
        });

        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([so]));
        savedObjectsSerializer.rawToSavedObject.mockReturnValueOnce(so);

        const result = await service.getAllTemplates({
          ...defaultFindParams,
          search: 'hostname',
        });

        expect(result.templates[0].fieldSearchMatches).toBe(true);
      });

      it('sets fieldSearchMatches to false for all templates when search is empty', async () => {
        const service = createService();
        const so = createTemplateSO('so-1', {
          templateId: 't-1',
          name: 'Template',
          fieldNames: [
            { name: 'severity', label: 'Severity', type: 'keyword', control: 'TEXT' },
            { name: 'hostname', label: 'Hostname', type: 'keyword', control: 'TEXT' },
          ],
        });

        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([so]));
        savedObjectsSerializer.rawToSavedObject.mockReturnValueOnce(so);

        const result = await service.getAllTemplates({ ...defaultFindParams });

        expect(result.templates[0].fieldSearchMatches).toBe(false);
      });

      it('sets fieldSearchMatches to false when fieldNames is undefined', async () => {
        const service = createService();
        const so = createTemplateSO('so-1', {
          templateId: 't-1',
          name: 'Template',
          // no fieldNames set
        });

        unsecuredSavedObjectsClient.search.mockResolvedValue(createMockSearchResponse([so]));
        savedObjectsSerializer.rawToSavedObject.mockReturnValueOnce(so);

        const result = await service.getAllTemplates({
          ...defaultFindParams,
          search: 'anything',
        });

        expect(result.templates[0].fieldSearchMatches).toBe(false);
      });
    });
  });

  describe('getTemplate', () => {
    it('returns the first saved object from ES search hits', async () => {
      const service = createService();
      const template = {
        id: 'template-1',
        attributes: { templateId: 'template-1', name: 'Template One' } as Template,
      } as SavedObject<Template>;

      const searchResponse = {
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: {
          total: { value: 1, relation: 'eq' },
          max_score: null,
          hits: [{ _id: 'template-1', _index: '.kibana_cases' }],
        },
      } as unknown as SavedObjectsSearchResponse<SavedObjectsRawDocSource, unknown>;

      unsecuredSavedObjectsClient.search.mockResolvedValue(searchResponse);
      savedObjectsSerializer.rawToSavedObject.mockReturnValueOnce(template);

      const result = await service.getTemplate('template-1');

      expect(unsecuredSavedObjectsClient.search).toHaveBeenCalled();
      expect(result).toEqual(template);
    });

    it('returns undefined when no templates are found', async () => {
      const service = createService();

      const searchResponse = {
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: 'eq' }, max_score: null, hits: [] },
      } as unknown as SavedObjectsSearchResponse<SavedObjectsRawDocSource, unknown>;

      unsecuredSavedObjectsClient.search.mockResolvedValue(searchResponse);

      const result = await service.getTemplate('missing-template');

      expect(result).toBeUndefined();
    });

    it('returns undefined when version is not a valid number', async () => {
      const service = createService();

      // Should not call search at all for invalid version
      const result = await service.getTemplate('template-1', 'abc');

      expect(result).toBeUndefined();
      expect(unsecuredSavedObjectsClient.search).not.toHaveBeenCalled();
    });

    it('returns undefined when version is an empty string', async () => {
      const service = createService();

      const result = await service.getTemplate('template-1', '');

      expect(result).toBeUndefined();
      expect(unsecuredSavedObjectsClient.search).not.toHaveBeenCalled();
    });
  });

  describe('getTemplateVersionsForExtendedFieldSearch', () => {
    it('fetches all template versions without isLatest filter', async () => {
      const service = createService();
      const templateV1 = createTemplateSO('template-v1', {
        templateId: 'incident-template',
        name: 'Incident Template v1',
        templateVersion: 1,
        isLatest: false,
        owner: 'securitySolution',
        fieldNames: [
          {
            name: 'effort_estimate',
            label: 'Effort Estimate',
            type: 'long',
            control: 'INPUT_NUMBER',
          },
        ],
      });
      const templateV2 = createTemplateSO('template-v2', {
        templateId: 'incident-template',
        name: 'Incident Template v2',
        templateVersion: 2,
        isLatest: true,
        owner: 'securitySolution',
        fieldNames: [
          { name: 'some_estimate', label: 'Some Estimate', type: 'long', control: 'INPUT_NUMBER' },
        ],
      });

      const searchResponse = createMockSearchResponse([templateV1, templateV2]);
      unsecuredSavedObjectsClient.search.mockResolvedValue(searchResponse);
      savedObjectsSerializer.rawToSavedObject
        .mockReturnValueOnce(templateV1)
        .mockReturnValueOnce(templateV2);

      const result = await service.getTemplateVersionsForExtendedFieldSearch({
        owner: ['securitySolution'],
      });

      expect(result).toHaveLength(2);
      expect(result).toEqual([templateV1, templateV2]);

      const searchCall = unsecuredSavedObjectsClient.search.mock.calls[0][0];
      expect(searchCall.query?.bool?.filter).toBeDefined();
      // Verify no isLatest filter is applied
      const filterStrings = JSON.stringify(searchCall.query?.bool?.filter);
      expect(filterStrings).not.toContain('isLatest');
    });

    it('fetches all template versions across multiple template IDs', async () => {
      const service = createService();
      const template1V1 = createTemplateSO('t1-v1', {
        templateId: 'template-1',
        name: 'Template 1 v1',
        templateVersion: 1,
        isLatest: false,
        owner: 'securitySolution',
        fieldNames: [],
      });
      const template1V2 = createTemplateSO('t1-v2', {
        templateId: 'template-1',
        name: 'Template 1 v2',
        templateVersion: 2,
        isLatest: true,
        owner: 'securitySolution',
        fieldNames: [],
      });
      const template2V1 = createTemplateSO('t2-v1', {
        templateId: 'template-2',
        name: 'Template 2 v1',
        templateVersion: 1,
        isLatest: true,
        owner: 'securitySolution',
        fieldNames: [],
      });

      const searchResponse = createMockSearchResponse([template1V1, template1V2, template2V1]);
      unsecuredSavedObjectsClient.search.mockResolvedValue(searchResponse);
      savedObjectsSerializer.rawToSavedObject
        .mockReturnValueOnce(template1V1)
        .mockReturnValueOnce(template1V2)
        .mockReturnValueOnce(template2V1);

      const result = await service.getTemplateVersionsForExtendedFieldSearch({
        owner: ['securitySolution'],
      });

      expect(result).toHaveLength(3);
    });

    it('returns empty array when no templates exist for owner', async () => {
      const service = createService();

      const searchResponse = createMockSearchResponse([]);
      unsecuredSavedObjectsClient.search.mockResolvedValue(searchResponse);

      const result = await service.getTemplateVersionsForExtendedFieldSearch({
        owner: ['nonexistent'],
      });

      expect(result).toEqual([]);
    });
  });

  it('persists description, tags, author, fieldCount and fieldNames on create', async () => {
    const definition = buildDefinition('Template With Metadata');
    const service = createService();

    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'template-id',
      attributes: {} as Template,
    } as SavedObject<Template>);

    await service.createTemplate(
      {
        owner: 'securitySolution',
        definition,
        description: 'A detailed description',
        tags: ['security', 'network'],
      },
      'alice',
      'generated-id'
    );

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      CASE_TEMPLATE_SAVED_OBJECT,
      expect.objectContaining({
        name: 'Template With Metadata',
        description: 'A detailed description',
        tags: ['security', 'network'],
        author: 'alice',
        fieldCount: 1,
        fieldNames: [
          { name: 'field_one', label: 'field_one', type: 'keyword', control: 'INPUT_TEXT' },
        ],
        isLatest: true,
      }),
      expect.objectContaining({ id: 'generated-id' })
    );
  });

  it('extracts description and tags from YAML on create, preferring YAML over input', async () => {
    const definition = buildDefinition('YAML Template', {
      description: 'Description from YAML',
      tags: ['yaml-tag-1', 'yaml-tag-2'],
    });
    const service = createService();

    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'template-id',
      attributes: {} as Template,
    } as SavedObject<Template>);

    await service.createTemplate(
      {
        owner: 'securitySolution',
        definition,
        description: 'Description from input',
        tags: ['input-tag'],
      },
      'alice',
      'generated-id'
    );

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      CASE_TEMPLATE_SAVED_OBJECT,
      expect.objectContaining({
        name: 'YAML Template',
        description: 'Description from YAML',
        tags: ['yaml-tag-1', 'yaml-tag-2'],
      }),
      expect.any(Object)
    );
  });

  it('persists isEnabled: false when explicitly set to false on create', async () => {
    const definition = buildDefinition('Disabled Template');
    const service = createService();

    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'template-id',
      attributes: {} as Template,
    } as SavedObject<Template>);

    await service.createTemplate(
      {
        owner: 'securitySolution',
        definition,
        isEnabled: false,
      },
      'alice'
    );

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      CASE_TEMPLATE_SAVED_OBJECT,
      expect.objectContaining({ isEnabled: false }),
      expect.any(Object)
    );
  });

  it('persists isEnabled: true when explicitly set to true on create', async () => {
    const definition = buildDefinition('Enabled Template');
    const service = createService();

    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'template-id',
      attributes: {} as Template,
    } as SavedObject<Template>);

    await service.createTemplate(
      {
        owner: 'securitySolution',
        definition,
        isEnabled: true,
      },
      'alice'
    );

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      CASE_TEMPLATE_SAVED_OBJECT,
      expect.objectContaining({ isEnabled: true }),
      expect.any(Object)
    );
  });

  it('defaults isEnabled to true when not provided on create', async () => {
    const definition = buildDefinition('Default Enabled Template');
    const service = createService();

    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'template-id',
      attributes: {} as Template,
    } as SavedObject<Template>);

    await service.createTemplate(
      {
        owner: 'securitySolution',
        definition,
      },
      'alice'
    );

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      CASE_TEMPLATE_SAVED_OBJECT,
      expect.objectContaining({ isEnabled: true }),
      expect.any(Object)
    );
  });

  it('falls back to input description and tags when not present in YAML on create', async () => {
    const definition = buildDefinition('Plain Template');
    const service = createService();

    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'template-id',
      attributes: {} as Template,
    } as SavedObject<Template>);

    await service.createTemplate(
      {
        owner: 'securitySolution',
        definition,
        description: 'Fallback description',
        tags: ['fallback-tag'],
      },
      'alice',
      'generated-id'
    );

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      CASE_TEMPLATE_SAVED_OBJECT,
      expect.objectContaining({
        name: 'Plain Template',
        description: 'Fallback description',
        tags: ['fallback-tag'],
      }),
      expect.any(Object)
    );
  });

  it('persists description, tags, author, fieldCount and fieldNames on update', async () => {
    const definition = buildDefinition('Updated With Metadata');
    const service = createService();

    jest
      .spyOn(
        service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
        '_getTemplate'
      )
      .mockResolvedValue({
        id: 'template-so-id',
        attributes: {
          templateId: 'template-id',
          name: 'Previous Template',
          owner: 'securitySolution',
          definition: buildDefinition('Previous Template'),
          templateVersion: 1,
          deletedAt: null,
          author: 'bob',
        },
      } as SavedObject<Template>);

    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'template-new-so-id',
      attributes: {} as Template,
    } as SavedObject<Template>);

    await service.updateTemplate('template-id', {
      owner: 'observability',
      definition,
      description: 'Updated description',
      tags: ['updated', 'tag'],
    });

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      CASE_TEMPLATE_SAVED_OBJECT,
      expect.objectContaining({
        name: 'Updated With Metadata',
        description: 'Updated description',
        tags: ['updated', 'tag'],
        author: 'bob',
        fieldCount: 1,
        fieldNames: [
          { name: 'field_one', label: 'field_one', type: 'keyword', control: 'INPUT_TEXT' },
        ],
        isLatest: true,
      }),
      expect.any(Object)
    );
  });

  it('extracts description and tags from YAML on update, preferring YAML over input', async () => {
    const definition = buildDefinition('YAML Updated', {
      description: 'YAML description',
      tags: ['yaml-tag'],
    });
    const service = createService();

    jest
      .spyOn(
        service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
        '_getTemplate'
      )
      .mockResolvedValue({
        id: 'template-so-id',
        attributes: {
          templateId: 'template-id',
          name: 'Previous',
          owner: 'securitySolution',
          definition: buildDefinition('Previous'),
          templateVersion: 1,
          deletedAt: null,
          author: 'alice',
        },
      } as SavedObject<Template>);

    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'template-new-so-id',
      attributes: {} as Template,
    } as SavedObject<Template>);

    await service.updateTemplate('template-id', {
      owner: 'observability',
      definition,
      description: 'Input description (should be overridden)',
      tags: ['input-tag'],
    });

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      CASE_TEMPLATE_SAVED_OBJECT,
      expect.objectContaining({
        description: 'YAML description',
        tags: ['yaml-tag'],
      }),
      expect.any(Object)
    );
  });

  it('falls back to input description and tags when not present in YAML on update', async () => {
    const definition = buildDefinition('Plain Updated');
    const service = createService();

    jest
      .spyOn(
        service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
        '_getTemplate'
      )
      .mockResolvedValue({
        id: 'template-so-id',
        attributes: {
          templateId: 'template-id',
          name: 'Previous',
          owner: 'securitySolution',
          definition: buildDefinition('Previous'),
          templateVersion: 1,
          deletedAt: null,
          author: 'alice',
        },
      } as SavedObject<Template>);

    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'template-new-so-id',
      attributes: {} as Template,
    } as SavedObject<Template>);

    await service.updateTemplate('template-id', {
      owner: 'observability',
      definition,
      description: 'Fallback description',
      tags: ['fallback-tag'],
    });

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      CASE_TEMPLATE_SAVED_OBJECT,
      expect.objectContaining({
        description: 'Fallback description',
        tags: ['fallback-tag'],
      }),
      expect.any(Object)
    );
  });

  describe('updateTemplate', () => {
    it('throws when the template does not exist', async () => {
      const service = createService();
      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue(undefined);

      await expect(
        service.updateTemplate('missing-template', {
          owner: 'securitySolution',
          definition: buildDefinition('Missing Template'),
        })
      ).rejects.toThrow('Template with id missing-template not found');
    });

    it('carries over usageCount and lastUsedAt from the previous version', async () => {
      const definition = buildDefinition('Edited Template');
      const service = createService();

      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue({
          id: 'template-so-id',
          attributes: {
            templateId: 'template-id',
            name: 'Previous Template',
            owner: 'securitySolution',
            definition: buildDefinition('Previous Template'),
            templateVersion: 3,
            deletedAt: null,
            author: 'alice',
            usageCount: 42,
            lastUsedAt: '2025-12-01T00:00:00.000Z',
          },
        } as SavedObject<Template>);

      unsecuredSavedObjectsClient.create.mockResolvedValue({
        id: 'template-new-so-id',
        attributes: {} as Template,
      } as SavedObject<Template>);

      await service.updateTemplate('template-id', {
        owner: 'securitySolution',
        definition,
      });

      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        CASE_TEMPLATE_SAVED_OBJECT,
        expect.objectContaining({
          templateVersion: 4,
          usageCount: 42,
          lastUsedAt: '2025-12-01T00:00:00.000Z',
        }),
        expect.any(Object)
      );
    });
  });

  describe('incrementUsageStats', () => {
    it('increments usageCount and sets lastUsedAt for an existing template', async () => {
      const service = createService();

      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue({
          id: 'so-1',
          attributes: {
            templateId: 'template-1',
            name: 'Template',
            usageCount: 5,
            lastUsedAt: '2025-01-01T00:00:00.000Z',
          },
        } as SavedObject<Template>);

      await service.incrementUsageStats('template-1');

      expect(unsecuredSavedObjectsClient.bulkUpdate).toHaveBeenCalledWith(
        [
          {
            id: 'so-1',
            type: CASE_TEMPLATE_SAVED_OBJECT,
            attributes: {
              usageCount: 6,
              lastUsedAt: expect.any(String),
            },
          },
        ],
        { refresh: false }
      );
    });

    it('sets usageCount to 1 when usageCount is undefined', async () => {
      const service = createService();

      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue({
          id: 'so-1',
          attributes: {
            templateId: 'template-1',
            name: 'Template',
          },
        } as SavedObject<Template>);

      await service.incrementUsageStats('template-1');

      expect(unsecuredSavedObjectsClient.bulkUpdate).toHaveBeenCalledWith(
        [
          {
            id: 'so-1',
            type: CASE_TEMPLATE_SAVED_OBJECT,
            attributes: {
              usageCount: 1,
              lastUsedAt: expect.any(String),
            },
          },
        ],
        { refresh: false }
      );
    });

    it('does nothing when template does not exist', async () => {
      const service = createService();

      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue(undefined);

      await service.incrementUsageStats('non-existent');

      expect(unsecuredSavedObjectsClient.bulkUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deleteTemplate', () => {
    it('marks all matching templates as deleted', async () => {
      const service = createService();

      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue(
          createTemplateSO('so-1', {
            name: 'Template',
            templateId: 'template-1',
            owner: 'securitySolution',
          })
        );

      const findResponse: SavedObjectsFindResponse = {
        page: 1,
        per_page: 10000,
        total: 2,
        saved_objects: [
          {
            id: 'so-1',
            type: CASE_TEMPLATE_SAVED_OBJECT,
            attributes: {} as Template,
            references: [],
            score: 0,
          },
          {
            id: 'so-2',
            type: CASE_TEMPLATE_SAVED_OBJECT,
            attributes: {} as Template,
            references: [],
            score: 0,
          },
        ],
      };

      unsecuredSavedObjectsClient.find.mockResolvedValue(findResponse);

      await service.deleteTemplate('template-1');

      expect(unsecuredSavedObjectsClient.bulkUpdate).toHaveBeenCalledWith(
        [
          {
            id: 'so-1',
            type: CASE_TEMPLATE_SAVED_OBJECT,
            attributes: { deletedAt: expect.any(String) },
          },
          {
            id: 'so-2',
            type: CASE_TEMPLATE_SAVED_OBJECT,
            attributes: { deletedAt: expect.any(String) },
          },
        ],
        { refresh: true }
      );
    });

    it('does nothing when template does not exist', async () => {
      const service = createService();

      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue(undefined);

      await service.deleteTemplate('non-existent');

      expect(unsecuredSavedObjectsClient.bulkUpdate).not.toHaveBeenCalled();
    });
  });

  describe('cases-analytics v2 data view refresh hook', () => {
    // The templates service can't observe template SOs directly — it owns
    // them. So when fields land or change, it has to tell the v2 subsystem
    // to refresh the per-space runtime field map. These tests pin down the
    // hook firing on every successful create / update / delete path.

    it('fires the refresh hook after createTemplate', async () => {
      const service = createService();
      unsecuredSavedObjectsClient.create.mockResolvedValue({
        id: 'template-id',
        attributes: {} as Template,
      } as SavedObject<Template>);

      await service.createTemplate(
        { owner: 'securitySolution', definition: buildDefinition('Hook Template') },
        'alice',
        'generated-id'
      );

      expect(refreshAnalyticsV2DataView).toHaveBeenCalledTimes(1);
    });

    it('fires the refresh hook after updateTemplate', async () => {
      const service = createService();
      const currentTemplate = createTemplateSO('current-id', {
        templateId: 'template-id',
        name: 'Old Name',
        owner: 'securitySolution',
        templateVersion: 1,
      });
      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue(currentTemplate);
      unsecuredSavedObjectsClient.create.mockResolvedValue({
        id: 'new-id',
        attributes: {} as Template,
      } as SavedObject<Template>);

      await service.updateTemplate('template-id', {
        owner: 'securitySolution',
        definition: buildDefinition('Updated'),
      });

      expect(refreshAnalyticsV2DataView).toHaveBeenCalledTimes(1);
    });

    it('fires the refresh hook after deleteTemplate', async () => {
      const service = createService();
      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue(
          createTemplateSO('so-1', {
            templateId: 'template-1',
            name: 'Template 1',
            owner: 'securitySolution',
          })
        );
      unsecuredSavedObjectsClient.find.mockResolvedValue({
        page: 1,
        per_page: 10000,
        total: 1,
        saved_objects: [
          {
            id: 'so-1',
            type: CASE_TEMPLATE_SAVED_OBJECT,
            attributes: {} as Template,
            references: [],
            score: 0,
          },
        ],
      } as SavedObjectsFindResponse);

      await service.deleteTemplate('template-1');

      expect(refreshAnalyticsV2DataView).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire the refresh hook when deleteTemplate finds nothing to delete', async () => {
      const service = createService();
      jest
        .spyOn(
          service as unknown as Record<'_getTemplate', typeof service.getTemplate>,
          '_getTemplate'
        )
        .mockResolvedValue(undefined);

      await service.deleteTemplate('non-existent');

      // Cheap signal that the call sites are wired correctly: hook fires
      // only on the actual write path, not on the early-return branch.
      expect(refreshAnalyticsV2DataView).not.toHaveBeenCalled();
    });
  });
});
