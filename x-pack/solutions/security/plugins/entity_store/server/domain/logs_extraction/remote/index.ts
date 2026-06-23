/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { RemoteLogsExtractionClient } from './remote_logs_extraction_client';
export { type RemoteExtractionStrategy, createCcsStrategy, createCpsStrategy } from './strategies';
export { createRemoteLogsExtractionClient } from './create_remote_logs_extraction_client';
