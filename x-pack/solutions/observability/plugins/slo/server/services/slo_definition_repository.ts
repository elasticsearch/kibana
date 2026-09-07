/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObject,
  SavedObjectReference,
  SavedObjectsClientContract,
} from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/core/server';
import type { Paginated, Pagination } from '@kbn/slo-schema';
import { ALL_VALUE, sloDefinitionSchemaZod, storedSloDefinitionSchemaZod } from '@kbn/slo-schema';
import { merge } from 'lodash';
import { SLO_MODEL_VERSION } from '../../common/constants';
import type { SLODefinition, StoredSLODefinition } from '../domain/models';
import { SLONotFound } from '../errors';
import { SO_SLO_TYPE } from '../saved_objects';

interface SearchParams {
  pagination: Pagination;
  search?: string;
  filters?: { includeOutdatedOnly: boolean; tags: string[] };
}

export interface SLODefinitionRepository {
  create(slo: SLODefinition): Promise<SLODefinition>;
  update(slo: SLODefinition): Promise<SLODefinition>;
  findAllByIds(ids: string[]): Promise<SLODefinition[]>;
  findById(id: string): Promise<SLODefinition>;
  deleteById(id: string, options?: { ignoreNotFound?: boolean }): Promise<void>;
  search({ search, pagination, filters }: SearchParams): Promise<Paginated<SLODefinition>>;
}

export class DefaultSLODefinitionRepository implements SLODefinitionRepository {
  constructor(private soClient: SavedObjectsClientContract, private logger: Logger) {}

  async create(slo: SLODefinition): Promise<SLODefinition> {
    const { storedSLO, references } = this.toStoredSLO(slo);
    await this.soClient.create<StoredSLODefinition>(SO_SLO_TYPE, storedSLO, { references });
    return slo;
  }

  async update(slo: SLODefinition): Promise<SLODefinition> {
    let existingSavedObjectId: string | undefined;

    const findResponse = await this.soClient.find<StoredSLODefinition>({
      type: SO_SLO_TYPE,
      perPage: 1,
      filter: `slo.attributes.id:(${slo.id})`,
    });
    if (findResponse.total === 1) {
      existingSavedObjectId = findResponse.saved_objects[0].id;
    }

    const { storedSLO, references } = this.toStoredSLO(slo);
    await this.soClient.create<StoredSLODefinition>(SO_SLO_TYPE, storedSLO, {
      id: existingSavedObjectId,
      overwrite: true,
      references,
    });

    return slo;
  }

  async findById(id: string): Promise<SLODefinition> {
    const response = await this.soClient.find<StoredSLODefinition>({
      type: SO_SLO_TYPE,
      page: 1,
      perPage: 1,
      filter: `slo.attributes.id:(${id})`,
    });

    if (response.total === 0) {
      throw new SLONotFound(`SLO [${id}] not found`);
    }

    const slo = this.toSLO(response.saved_objects[0]);
    if (slo === undefined) {
      throw new Error('Invalid stored SLO');
    }

    return slo;
  }

  async deleteById(id: string, { ignoreNotFound = false }): Promise<void> {
    const response = await this.soClient.find<StoredSLODefinition>({
      type: SO_SLO_TYPE,
      page: 1,
      perPage: 1,
      filter: `slo.attributes.id:(${id})`,
    });

    if (response.total === 0) {
      if (ignoreNotFound) {
        return;
      }
      throw new SLONotFound(`SLO [${id}] not found`);
    }

    await this.soClient.delete(SO_SLO_TYPE, response.saved_objects[0].id);
  }

  async findAllByIds(ids: string[]): Promise<SLODefinition[]> {
    if (ids.length === 0) return [];

    const response = await this.soClient.find<StoredSLODefinition>({
      type: SO_SLO_TYPE,
      page: 1,
      perPage: ids.length,
      filter: `slo.attributes.id:(${ids.join(' or ')})`,
    });

    return response.saved_objects.map((so) => this.toSLO(so)).filter(this.isSLO);
  }

  async search({
    search,
    pagination,
    filters = { includeOutdatedOnly: false, tags: [] },
  }: SearchParams): Promise<Paginated<SLODefinition>> {
    const { includeOutdatedOnly, tags } = filters;
    const filter = [];
    if (tags.length > 0) {
      filter.push(`slo.attributes.tags: (${tags.join(' OR ')})`);
    }

    if (!!includeOutdatedOnly) {
      filter.push(`slo.attributes.version < ${SLO_MODEL_VERSION}`);
    }

    const response = await this.soClient.find<StoredSLODefinition>({
      type: SO_SLO_TYPE,
      page: pagination.page,
      perPage: pagination.perPage,
      ...(!!search && { search, searchFields: ['name'] }),
      ...(filter.length && { filter: filter.join(' AND ') }),
      sortField: 'id',
      sortOrder: 'asc',
    });

    return {
      total: response.total,
      perPage: response.per_page,
      page: response.page,
      results: response.saved_objects
        .map((savedObject) => this.toSLO(savedObject))
        .filter(this.isSLO),
    };
  }

  private toSLO(storedSLOObject: SavedObject<StoredSLODefinition>): SLODefinition | undefined {
    const storedSLO = storedSLOObject.attributes;
    const dashboardsIds = this.getDashboardsIds({
      dashboardsRef: storedSLO.artifacts?.dashboards,
      references: storedSLOObject.references,
    });

    const result = sloDefinitionSchemaZod.safeParse({
      ...storedSLO,
      // groupBy was added in 8.10.0
      groupBy: storedSLO.groupBy ?? ALL_VALUE,
      // version was added in 8.12.0. This is a safeguard against SO migration issue.
      // if not present, we considered the version to be 1, e.g. not migrated.
      // We would need to call the _reset api on this SLO.
      version: storedSLO.version ?? 1,
      // settings.preventInitialBackfill was added in 8.15.0
      // never backfill preventCrossProjectSearch or projectRoutings — absence must stay absence
      settings: merge(
        {
          preventInitialBackfill: false,
          syncDelay: '1m',
          frequency: '1m',
        },
        storedSLO.settings
      ),
      createdBy: storedSLO.createdBy ?? storedSLOObject.created_by,
      updatedBy: storedSLO.updatedBy ?? storedSLOObject.updated_by,
      artifacts: { dashboards: dashboardsIds },
    });

    if (!result.success) {
      this.logger.debug(`Invalid stored SLO with id [${storedSLO.id}]`);
      return undefined;
    }

    return result.data;
  }

  private getDashboardsIds({
    dashboardsRef,
    references,
  }: {
    dashboardsRef?: { refId: string }[];
    references: SavedObjectReference[];
  }): { id: string }[] {
    if (!dashboardsRef || dashboardsRef.length === 0) {
      return [];
    }

    const refMap = new Map(references.map(({ name, id }) => [name, id]));

    return dashboardsRef.flatMap(({ refId }) => {
      const id = refMap.get(refId);
      if (!id) {
        this.logger.debug(`Invalid reference [${refId}]`);
        return [];
      }
      return [{ id }];
    });
  }

  private isSLO(slo: SLODefinition | undefined): slo is SLODefinition {
    return slo !== undefined;
  }

  private toStoredSLO(slo: SLODefinition): {
    storedSLO: StoredSLODefinition;
    references: SavedObjectReference[];
  } {
    const dashboardsRef: { refId: string }[] = [];
    const references: SavedObjectReference[] = [];
    if (slo.artifacts?.dashboards?.length) {
      slo.artifacts.dashboards.forEach(({ id }, index) => {
        const refId = `dashboard-${index}`;
        references.push({ id, type: 'dashboard', name: refId });
        dashboardsRef.push({ refId });
      });
    }
    return {
      storedSLO: storedSloDefinitionSchemaZod.encode({
        ...slo,
        artifacts: { dashboards: dashboardsRef },
      }),
      references,
    };
  }
}
