/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { TemplateMetadataSchema } from './template';

/**
 * Schema for a single row in `catalogs/templates.json`. Shares most fields
 * with the parsed `template-metadata` block but omits `install` (lives in
 * the body) and adds the CI-derived fields the browse UI consumes.
 */
export const TemplateSchema = TemplateMetadataSchema.omit({ install: true })
  .extend({
    definitionUrl: z.string().min(1).max(2048),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/i, 'Must be `sha256:<hex>`.'),
    // Full `type` strings for every step (recursively, including nested steps)
    // and every trigger in the template, derived by the catalog generator. The
    // Library UI maps these to icons. Either array may be empty.
    stepTypes: z.array(z.string().min(1).max(256)).max(1000),
    triggerTypes: z.array(z.string().min(1).max(256)).max(1000),
  })
  .strict();

export const TemplatesCatalogSchema = z
  .object({
    version: z.string().min(1).max(256),
    kibanaVersion: z.string().min(1).max(256),
    generatedAt: z.string().min(1).max(256),
    templates: z.array(TemplateSchema).max(1000),
  })
  .strict();

export const KibanaVersionEntrySchema = z
  .object({
    id: z.string().min(1).max(256),
    kibana: z.string().min(1).max(256),
    active: z.boolean(),
  })
  .strict();

export const KibanaVersionsManifestSchema = z
  .object({
    versions: z.array(KibanaVersionEntrySchema).max(100),
    latest: z.string().min(1).max(256),
  })
  .strict();

/**
 * Consumption-side variants used by the Kibana runtime (`LibraryFetcher`) when
 * it validates catalog JSON fetched from the CDN. They mirror the strict base
 * schemas above but strip unknown-key handling — at the top level and on each row —
 * so an older Kibana tolerates a newer catalog that adds fields
 * Template Authoring / CI validation uses the strict base schemas.
 */
export const TemplatesCatalogConsumptionSchema = TemplatesCatalogSchema.extend({
  templates: z.array(TemplateSchema.strip()).max(1000),
}).strip();

export const KibanaVersionsManifestConsumptionSchema = KibanaVersionsManifestSchema.extend({
  versions: z.array(KibanaVersionEntrySchema.strip()).max(100),
}).strip();
