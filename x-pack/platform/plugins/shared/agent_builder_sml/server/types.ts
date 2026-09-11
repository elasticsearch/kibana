/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { Logger } from '@kbn/logging';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type {
  ContextEnginePluginSetup,
  ContextEnginePluginStart,
} from '@kbn/context-engine-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-server';
import type {
  SmlTypeDefinition,
  SmlSearchResult,
  SmlSearchFilters,
  SmlSearchConstraints,
  SmlIndexAction,
  SmlDeleteScope,
  SmlIndexAttachmentOriginMode,
} from './services/sml/types';
import type { SmlResolvedItemResult } from './services/sml/execute_sml_attach_items';

export interface AgentBuilderSmlSetupDependencies {
  features: FeaturesPluginSetup;
  taskManager: TaskManagerSetupContract;
  contextEngine?: ContextEnginePluginSetup;
}

export interface AgentBuilderSmlStartDependencies {
  taskManager: TaskManagerStartContract;
  spaces?: SpacesPluginStart;
  security?: SecurityPluginStart;
  contextEngine?: ContextEnginePluginStart;
}

export interface AgentBuilderSmlPluginSetup {
  registerType: (definition: SmlTypeDefinition) => void;
}

export interface AgentBuilderSmlPluginStart {
  search: (params: {
    query: string;
    size?: number;
    spaceId: string;
    esClient: IScopedClusterClient;
    request: KibanaRequest;
    /**
     * Optional subset of fields to return. Omit for all fields. Valid optional
     * values: `'content'`, `'description'`, `'tags'`, `'references'`.
     */
    fields?: string[];
    /** Runtime-imposed per-type id-allowlist constraints. */
    constraints?: SmlSearchConstraints;
    /** Agent-discoverable filters (`types[]`, `tags[]`). */
    filters?: SmlSearchFilters;
  }) => Promise<{ results: SmlSearchResult[] }>;

  getTypeDefinition: (typeId: string) => SmlTypeDefinition | undefined;

  resolveSmlAttachItems: (params: {
    entryIds: string[];
    esClient: IScopedClusterClient;
    request: KibanaRequest;
    spaceId: string;
    savedObjectsClient: SavedObjectsClientContract;
    logger: Logger;
  }) => Promise<SmlResolvedItemResult[]>;

  indexAttachment: (params: SmlIndexAttachmentParams) => Promise<void>;
  deleteAttachment: (params: SmlDeleteAttachmentParams) => Promise<void>;
}

/**
 * Common params for `AgentBuilderSmlPluginStart.indexAttachment`.
 */
interface SmlIndexAttachmentBaseParams {
  request: KibanaRequest;
  originId: string;
  attachmentType: string;
  action: SmlIndexAction;
  spaceId?: string;
  includedHiddenTypes?: string[];
}

type SmlIndexAttachmentOriginParams = SmlIndexAttachmentBaseParams & SmlIndexAttachmentOriginMode;

/**
 * Params for `indexAttachment`. Content is resolved via the registered type's
 * `getSmlEntry` hook (origin mode). The resulting entry is tagged
 * `ingestion_method: 'crawled'`.
 */
export type SmlIndexAttachmentParams = SmlIndexAttachmentOriginParams;

/**
 * Params for `AgentBuilderSmlPluginStart.deleteAttachment`.
 *
 * Distinct from `indexAttachment({ action: 'delete' })` only in that callers
 * can choose to wipe a `'manual'` or `'all'` entry via `ingestionMethod`. With
 * the default (`'crawled'`) the two are equivalent.
 */
export interface SmlDeleteAttachmentParams {
  request: KibanaRequest;
  originId: string;
  attachmentType: string;
  /** Defaults to `'crawled'`. Pass `'all'` to fully retire the origin. */
  ingestionMethod?: SmlDeleteScope;
  spaceId?: string;
  includedHiddenTypes?: string[];
}
