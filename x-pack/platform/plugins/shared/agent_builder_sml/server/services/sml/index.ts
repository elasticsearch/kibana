/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  SmlService,
  SmlTypeDefinition,
  SmlEntry,
  SmlContext,
  SmlToAttachmentContext,
  SmlListItem,
  SmlSearchResult,
  SmlDocument,
  SmlDocumentAttributes,
  SmlCrawlerStateDocument,
  SmlCrawler,
  SmlIndexAction,
} from './types';
export {
  createSmlService,
  isNotFoundError,
  type SmlServiceSetup,
  type SmlServiceInstance,
} from './sml_service';
export { createSmlTypeRegistry, type SmlTypeRegistry } from './sml_type_registry';
export { createSmlIndexer, type SmlIndexer } from './sml_indexer';
export {
  registerSmlCrawlerTaskDefinition,
  scheduleSmlCrawlerTasks,
  SML_CRAWLER_TASK_TYPE,
} from './sml_task_definitions';
export { resolveSmlAttachItems } from './execute_sml_attach_items';
export { smlIndexName } from './sml_storage';
