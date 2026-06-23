/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { WorkspaceClient, type IWorkspaceClient } from './client/workspace_client';
export { createStorage as createWorkspaceStorage, workspaceIndexName } from './client/storage';
export type { WorkspaceFile, WorkspaceSnapshot } from './types';
