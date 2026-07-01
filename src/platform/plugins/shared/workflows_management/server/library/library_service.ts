/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import type { Template, TemplateBody } from '@kbn/workflows-library';

import type { LibraryHealth } from './library_cache';
import { LibraryFetcher } from './library_fetcher';
import type { WorkflowsManagementConfig } from '../config';

interface LibraryServiceDeps {
  config: WorkflowsManagementConfig;
  logger: Logger;
  kibanaVersion: string;
  isServerless: boolean;
}

export interface TemplateFilters {
  solution?: string;
  category?: string;
  search?: string;
}

/**
 * Entry point used by route handlers. Owns a {@link LibraryFetcher} for
 * retrieval and applies in-memory filtering on top of the catalog the
 * fetcher returns. Keeping filter logic here (instead of inside the
 * fetcher) keeps the fetcher focused on HTTP + freshness; the service is
 * the natural home for business-level read concerns like
 * solution/category/search filters.
 */
export class LibraryService {
  private readonly fetcher: LibraryFetcher;

  constructor(deps: LibraryServiceDeps) {
    const logger = deps.logger.get('library');
    this.fetcher = new LibraryFetcher({
      registryUrl: deps.config.library.registryUrl,
      kibanaVersion: deps.kibanaVersion,
      isServerless: deps.isServerless,
      ttlMs: deps.config.library.ttlMs,
      logger,
    });
  }

  async listTemplates(filters?: TemplateFilters): Promise<Template[]> {
    const templates = await this.fetcher.listTemplates();
    return filterTemplates(templates, filters);
  }

  async getTemplate(slug: string): Promise<TemplateBody> {
    return this.fetcher.getTemplate(slug);
  }

  getHealth(): LibraryHealth {
    return this.fetcher.getHealth();
  }
}

function filterTemplates(templates: Template[], filters?: TemplateFilters): Template[] {
  if (!filters) return templates;
  const search = filters.search?.trim().toLowerCase();

  return templates.filter((t) => {
    if (filters.solution !== undefined) {
      const solutions = t.solutions ?? [];
      const isCrossSolution = solutions.length === 0;
      if (!isCrossSolution && !solutions.includes(filters.solution)) return false;
    }
    if (filters.category !== undefined && !t.categories.includes(filters.category)) {
      return false;
    }
    if (search) {
      const haystack = [t.name, t.description, ...t.categories].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}
