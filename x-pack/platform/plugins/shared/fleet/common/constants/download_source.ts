/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Default source URI used to download Elastic Agent
export const DEFAULT_DOWNLOAD_SOURCE_URI = 'https://artifacts.elastic.co/downloads/';

export const DOWNLOAD_SOURCE_SAVED_OBJECT_TYPE = 'ingest-download-sources';

export const DEFAULT_DOWNLOAD_SOURCE_ID = 'fleet-default-download-source';

/**
 * Placeholder used in an agent policy `download_source_ids` list to reserve a
 * position for whichever download source is currently marked as default. It is
 * resolved when the policy is compiled, so the entry follows the default source
 * rather than pinning the id it happened to have when the policy was saved.
 */
export const DEFAULT_DOWNLOAD_SOURCE_REFERENCE = 'default';
