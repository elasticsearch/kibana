/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, KibanaRequest } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { LicenseType } from '@kbn/licensing-types';
import type { EntityUpdateClient } from '../../domain/crud';
import type { EntityMetadataClient } from '../../domain/entity_metadata';
import type { MaintainerTelemetryClient } from './maintainer_telemetry_client';

export const EntityMaintainerTaskStatus = {
  NEVER_STARTED: 'never_started',
  STARTED: 'started',
  STOPPED: 'stopped',
} as const;

export type EntityMaintainerTaskStatus =
  (typeof EntityMaintainerTaskStatus)[keyof typeof EntityMaintainerTaskStatus];

export const EntityMaintainerTelemetryEventType = {
  REGISTER: 'register',
  ABORT: 'abort',
  SETUP: 'setup',
  RUN: 'run',
  ERROR: 'error',
  STOP: 'stop',
  START: 'start',
  DELETE: 'delete',
} as const;

export type EntityMaintainerTelemetryEventType =
  (typeof EntityMaintainerTelemetryEventType)[keyof typeof EntityMaintainerTelemetryEventType];

export interface EntityMaintainerRegistryData {
  interval: string;
  description?: string;
  minLicense: LicenseType;
}

export interface EntityMaintainerTaskEntry extends EntityMaintainerRegistryData {
  id: string;
}

export interface EntityMaintainerLifecycle {
  run: EntityMaintainerTaskMethod;
  setup?: EntityMaintainerTaskMethod;
  initialState: EntityMaintainerState;
}

export interface EntityMaintainerRegistration
  extends EntityMaintainerTaskEntry,
    EntityMaintainerLifecycle {}

export interface EntityMaintainerRegistryValue {
  task: EntityMaintainerTaskEntry;
  lifecycle: EntityMaintainerLifecycle;
}

export interface EntityMaintainerStatusMetadata {
  namespace: string;
  runs: number;
  lastSuccessTimestamp: string | null;
  lastErrorTimestamp: string | null;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | EntityMaintainerState | JsonValue[];
export interface EntityMaintainerState {
  [key: string]: JsonValue;
}

export interface EntityMaintainerStatus extends Record<string, unknown> {
  metadata: EntityMaintainerStatusMetadata;
  state: EntityMaintainerState;
  taskStatus: EntityMaintainerTaskStatus;
}

export interface EntityMaintainerTaskMethodContext {
  status: EntityMaintainerStatus;
  abortController: AbortController;
  logger: Logger;
  fakeRequest: KibanaRequest;
  esClient: ElasticsearchClient;
  cpsEsClient: ElasticsearchClient;
  crudClient: EntityUpdateClient;
  entityMetadataClient: EntityMetadataClient;
  telemetry: MaintainerTelemetryClient;
}

export type EntityMaintainerTaskMethod = (
  context: EntityMaintainerTaskMethodContext
) => Promise<EntityMaintainerState>;

export interface RegisterEntityMaintainerConfig {
  id: string;
  description?: string;
  interval: string;
  timeout?: string;
  initialState: EntityMaintainerState;
  run: EntityMaintainerTaskMethod;
  setup?: EntityMaintainerTaskMethod;
  minLicense?: LicenseType;
}
