/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Template, TemplateBody } from '@kbn/workflows-library';

import type { LibraryHealth } from './library_cache';

/**
 * Source-mode abstraction the {@link LibraryService} consumes. Two
 * implementations exist:
 *   - {@link LibraryFetcher} — HTTP source mode (fetches from the CDN).
 *   - {@link LibraryBundleReader} — local bundle source mode (reads an
 *     extracted air-gap tarball from the Kibana host's filesystem).
 *
 * The service selects one at construction time based on plugin config
 * (`bundlePath` set ⇒ bundle, otherwise HTTP); route handlers never see the
 * difference.
 */
export interface LibrarySource {
  listTemplates(): Promise<Template[]>;
  getTemplate(slug: string): Promise<TemplateBody>;
  getHealth(): LibraryHealth;
}
