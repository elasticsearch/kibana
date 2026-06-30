/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type {
  ElasticsearchClient,
  ISavedObjectsSerializer,
  SavedObject,
  SavedObjectsClientContract,
  SavedObjectsRawDoc,
} from '@kbn/core/server';
import { toElasticsearchQuery, fromKueryExpression } from '@kbn/es-query';
import { v4 } from 'uuid';
import { parse as parseYaml } from 'yaml';
import type {
  CreateTemplateInput,
  ParsedTemplate,
  Template,
  UpdateTemplateInput,
} from '../../../common/types/domain/template/v1';
import { toFieldNames, trimFieldDefaults } from './utils';
import { CASE_TEMPLATE_SAVED_OBJECT } from '../../../common/constants';
import type {
  TemplatesFindRequest,
  TemplatesFindResponse,
} from '../../../common/types/api/template/v1';

export class TemplatesService {
  constructor(
    private readonly dependencies: {
      unsecuredSavedObjectsClient: SavedObjectsClientContract;
      savedObjectsSerializer: ISavedObjectsSerializer;
      esClient: ElasticsearchClient;
      namespace: string;
      /**
       * Bound, parameterless callback that asks the cases-analytics v2
       * subsystem to recompute and persist this space's runtime field map.
       * Fire-and-forget — never awaited; never throws past this service.
       *
       * Called at the tail of every template create / update / delete. The
       * cases client factory binds this to the current request's space + SO
       * client. When v2 is disabled the bound function is a no-op (see
       * `V2_NOOP_DATA_VIEW_REFRESHER`).
       */
      refreshAnalyticsV2DataView: () => void;
    }
  ) {}

  async getAllTemplates(params: TemplatesFindRequest): Promise<TemplatesFindResponse> {
    const {
      page,
      perPage,
      sortField = 'name',
      sortOrder = 'asc',
      search,
      tags,
      author,
      owner,
      isDeleted,
      isEnabled,
    } = params;

    const { templates, total } = await this.searchTemplates({
      page,
      perPage,
      sortField,
      sortOrder,
      isDeleted,
      search,
      tags,
      author,
      owner,
      isLatest: true,
      isEnabled,
    });

    const searchLower = search?.toLowerCase() ?? '';

    return {
      templates: templates.map((so) => ({
        ...so.attributes,
        fieldSearchMatches:
          searchLower !== '' &&
          (so.attributes.fieldNames ?? []).some(
            (field) =>
              field.label.toLowerCase().includes(searchLower) ||
              field.name.toLowerCase().includes(searchLower)
          ),
      })),
      page,
      perPage,
      total,
    };
  }

  async getTemplate(
    templateId: string,
    version?: string,
    { includeDeleted = false }: { includeDeleted?: boolean } = {}
  ): Promise<SavedObject<Template> | undefined> {
    return this._getTemplate(templateId, version, { includeDeleted });
  }

  /**
   * Fetches ALL template versions (not just isLatest) for extended field filtering in case search.
   *
   * This is critical for extended field filtering because cases may reference
   * older template versions where field definitions have changed. We need to
   * resolve filters against ALL versions to correctly match cases created with
   * historical template versions.
   *
   * Example: If template v1 has "effort estimate" field and v2 renames it to
   * "some estimate", searching for "effort estimate" should only match cases
   * created with v1, not v2. By fetching ALL versions, the filter resolution
   * correctly identifies which template versions have which fields.
   *
   * @param params - Find parameters (owner, isDeleted)
   * @returns Promise resolving to array of all template versions matching the criteria
   *
   * @example
   * // Get all versions of Security Solution templates for extended field search
   * const allVersions = await service.getTemplateVersionsForExtendedFieldSearch({
   *   owner: ['securitySolution'],
   * });
   */
  async getTemplateVersionsForExtendedFieldSearch(params: {
    owner?: string[];
  }): Promise<Array<SavedObject<Template>>> {
    const { templates } = await this.searchTemplates({
      page: 1,
      perPage: 10000,
      sortField: 'name',
      sortOrder: 'asc',
      owner: params.owner,
      // CRITICAL: Do NOT set isLatest - we want ALL versions
    });

    return templates;
  }

  private async _getTemplate(
    templateId: string,
    version?: string,
    { includeDeleted = false }: { includeDeleted?: boolean } = {}
  ): Promise<SavedObject<Template> | undefined> {
    if (version !== undefined) {
      const parsedVersion = parseInt(version, 10);
      if (isNaN(parsedVersion) || version === '') {
        return undefined;
      }
    }

    const { templates } = await this.searchTemplates({
      page: 1,
      perPage: 1,
      sortField: 'templateVersion',
      sortOrder: 'desc',
      templateId,
      version,
      ...(version === undefined ? { isLatest: true } : {}),
      ...(includeDeleted ? { isDeleted: true } : {}),
    });

    return templates[0];
  }

  /**
   * Fetches templates from ES using regular search.
   */
  private async searchTemplates({
    page,
    perPage,
    sortField,
    sortOrder,
    isDeleted = false,
    templateId,
    version,
    isLatest,
    search,
    tags,
    author,
    owner,
    isEnabled,
  }: {
    page: number;
    perPage: number;
    sortField: TemplatesFindRequest['sortField'];
    sortOrder: TemplatesFindRequest['sortOrder'];
    isDeleted?: boolean;
    templateId?: string;
    version?: string;
    isLatest?: boolean;
    search?: string;
    tags?: string[];
    author?: string[];
    owner?: string[];
    isEnabled?: boolean;
  }): Promise<{ templates: Array<SavedObject<Template>>; total: number }> {
    interface SearchResult {
      hits: {
        hits: SavedObjectsRawDoc[];
        total: {
          value: number;
        };
      };
    }

    const SO = CASE_TEMPLATE_SAVED_OBJECT;

    const filters = [
      ...(isDeleted ? [] : [toElasticsearchQuery(fromKueryExpression(`NOT ${SO}.deletedAt: *`))]),
      ...(isEnabled !== undefined
        ? [toElasticsearchQuery(fromKueryExpression(`${SO}.isEnabled: ${isEnabled}`))]
        : []),
      ...(templateId
        ? [toElasticsearchQuery(fromKueryExpression(`${SO}.templateId: "${templateId}"`))]
        : []),
      ...(version
        ? [toElasticsearchQuery(fromKueryExpression(`${SO}.templateVersion: "${version}"`))]
        : []),
      ...(isLatest !== undefined
        ? [toElasticsearchQuery(fromKueryExpression(`${SO}.isLatest: ${isLatest}`))]
        : []),
      ...(tags && tags.length > 0
        ? [
            toElasticsearchQuery(
              fromKueryExpression(tags.map((tag) => `${SO}.tags: "${tag}"`).join(' OR '))
            ),
          ]
        : []),
      ...(author && author.length > 0
        ? [
            toElasticsearchQuery(
              fromKueryExpression(author.map((a) => `${SO}.author: "${a}"`).join(' OR '))
            ),
          ]
        : []),
      ...(owner && owner.length > 0
        ? [
            toElasticsearchQuery(
              fromKueryExpression(owner.map((o) => `${SO}.owner: "${o}"`).join(' OR '))
            ),
          ]
        : []),
    ];

    const must = search
      ? [
          {
            bool: {
              should: [
                { wildcard: { [`${SO}.name`]: { value: `*${search}*`, case_insensitive: true } } },
                {
                  match_phrase: {
                    [`${SO}.description`]: search,
                  },
                },
                {
                  nested: {
                    path: `${SO}.fieldNames`,
                    query: {
                      bool: {
                        should: [
                          {
                            wildcard: {
                              [`${SO}.fieldNames.name`]: {
                                value: `*${search}*`,
                                case_insensitive: true,
                              },
                            },
                          },
                          {
                            match: {
                              [`${SO}.fieldNames.label`]: search,
                            },
                          },
                        ],
                        minimum_should_match: 1,
                      },
                    },
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
        ]
      : [];

    const from = (page - 1) * perPage;

    const sort = [
      {
        [`${CASE_TEMPLATE_SAVED_OBJECT}.${sortField}`]: {
          order: sortOrder,
          missing: '_last',
        },
      },
      ...(sortField === 'templateId'
        ? []
        : [
            {
              [`${CASE_TEMPLATE_SAVED_OBJECT}.templateId`]: {
                order: 'asc' as const,
              },
            },
          ]),
    ];

    const findResult = (await this.dependencies.unsecuredSavedObjectsClient.search({
      type: CASE_TEMPLATE_SAVED_OBJECT,
      namespaces: [this.dependencies.namespace],
      from,
      size: perPage,
      sort,
      query: {
        bool: {
          filter: filters,
          ...(must.length > 0 ? { must } : {}),
        },
      },
    })) as SearchResult;

    return {
      templates: findResult.hits.hits.map((hit) =>
        this.dependencies.savedObjectsSerializer.rawToSavedObject<Template>(hit)
      ),
      total: findResult.hits.total.value,
    };
  }

  async createTemplate(
    input: CreateTemplateInput,
    author: string,
    id: string = v4()
  ): Promise<SavedObject<Template>> {
    const normalizedDefinition = trimFieldDefaults(input.definition);
    const parsedDefinition = parseYaml(normalizedDefinition) as ParsedTemplate['definition'];

    const templateSavedObject = await this.dependencies.unsecuredSavedObjectsClient.create(
      CASE_TEMPLATE_SAVED_OBJECT,
      {
        templateVersion: 1,
        isLatest: true,
        deletedAt: null,
        definition: normalizedDefinition,
        name: parsedDefinition.name,
        owner: input.owner,
        templateId: v4(),
        description: parsedDefinition.description ?? input.description,
        tags: parsedDefinition.tags ?? input.tags,
        author,
        fieldCount: parsedDefinition.fields.length,
        fieldNames: toFieldNames(parsedDefinition.fields),
        isEnabled: input.isEnabled ?? true,
      } as Template,
      { refresh: true, id }
    );

    // Tell cases-analytics v2 to recompute the per-space runtime field map.
    // Fire-and-forget; failures are caught + logged inside the v2 service.
    this.dependencies.refreshAnalyticsV2DataView();

    return templateSavedObject;
  }

  async updateTemplate(
    templateId: string,
    input: UpdateTemplateInput
  ): Promise<SavedObject<Template>> {
    const currentTemplate = await this._getTemplate(templateId);

    if (!currentTemplate) {
      throw Boom.notFound(`Template with id ${templateId} not found`);
    }

    const normalizedDefinition = trimFieldDefaults(input.definition);
    const parsedDefinition = parseYaml(normalizedDefinition) as ParsedTemplate['definition'];

    const templateSavedObject = await this.dependencies.unsecuredSavedObjectsClient.create(
      CASE_TEMPLATE_SAVED_OBJECT,
      {
        templateVersion: currentTemplate.attributes.templateVersion + 1,
        isLatest: true,
        definition: normalizedDefinition,
        name: parsedDefinition.name,
        owner: input.owner,
        templateId: currentTemplate.attributes.templateId,
        deletedAt: null,
        description: parsedDefinition.description ?? input.description,
        tags: parsedDefinition.tags ?? input.tags,
        author: currentTemplate.attributes.author,
        fieldCount: parsedDefinition.fields.length,
        fieldNames: toFieldNames(parsedDefinition.fields),
        usageCount: currentTemplate.attributes.usageCount,
        lastUsedAt: currentTemplate.attributes.lastUsedAt,
        isEnabled: input.isEnabled ?? currentTemplate.attributes.isEnabled ?? true,
      } as Template,
      {
        refresh: true,
      }
    );

    await this.dependencies.unsecuredSavedObjectsClient.bulkUpdate(
      [
        {
          id: currentTemplate.id,
          type: CASE_TEMPLATE_SAVED_OBJECT,
          attributes: {
            isLatest: false,
          },
        },
      ],
      { refresh: true }
    );

    // Update may shift `fieldNames` (different field set, renamed fields,
    // changed types). Tell v2 to refresh.
    this.dependencies.refreshAnalyticsV2DataView();

    return templateSavedObject;
  }

  /**
   * Returns all unique tags from the latest version of each non-deleted template.
   */
  async getTags(): Promise<string[]> {
    const { templates } = await this.searchTemplates({
      page: 1,
      perPage: 10000,
      sortField: 'name',
      sortOrder: 'asc',
      isLatest: true,
    });
    const tags = templates.flatMap((so) => so.attributes.tags ?? []).filter(Boolean);
    return [...new Set(tags)].sort();
  }

  /**
   * Returns all unique authors from the latest version of each non-deleted template.
   */
  async getAuthors(): Promise<string[]> {
    const { templates } = await this.searchTemplates({
      page: 1,
      perPage: 10000,
      sortField: 'name',
      sortOrder: 'asc',
      isLatest: true,
    });
    const authors = templates
      .map((so) => so.attributes.author)
      .filter((a): a is string => Boolean(a));
    return [...new Set(authors)].sort();
  }

  async incrementUsageStats(templateId: string): Promise<void> {
    const template = await this._getTemplate(templateId);

    if (!template) {
      return;
    }

    await this.dependencies.unsecuredSavedObjectsClient.bulkUpdate(
      [
        {
          id: template.id,
          type: CASE_TEMPLATE_SAVED_OBJECT,
          attributes: {
            usageCount: (template.attributes.usageCount ?? 0) + 1,
            lastUsedAt: new Date().toISOString(),
          },
        },
      ],
      { refresh: false }
    );
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const latestTemplate = await this._getTemplate(templateId);

    if (!latestTemplate) {
      return;
    }

    const templateSnapshots = await this.dependencies.unsecuredSavedObjectsClient.find({
      type: CASE_TEMPLATE_SAVED_OBJECT,
      filter: fromKueryExpression(
        `${CASE_TEMPLATE_SAVED_OBJECT}.attributes.templateId: "${templateId}"`
      ),
      perPage: 10000,
      page: 1,
    });

    const ids = templateSnapshots.saved_objects.map((so) => so.id);

    await this.dependencies.unsecuredSavedObjectsClient.bulkUpdate(
      ids.map((id) => ({
        id,
        type: CASE_TEMPLATE_SAVED_OBJECT,
        attributes: {
          deletedAt: new Date().toISOString(),
        },
      })),
      { refresh: true }
    );

    // Refresh the per-space runtime field map even on soft-delete: keeps
    // the propagation hook wired so future changes to the template field
    // collection reach the data view without a code change.
    this.dependencies.refreshAnalyticsV2DataView();
  }
}
