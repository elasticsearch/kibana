/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHmac, randomBytes } from 'crypto';
import type { PiiTokenizationContext } from '../workflow_anonymization_capabilities';
import type { PiiDetectionContext } from './pii_detection_context';
import { generateEntityToken } from './detection/entity_mask';

const deriveExecutionScope = ({
  serverSalt,
  sessionId,
}: {
  serverSalt?: string;
  sessionId?: string;
}): string => {
  if (!sessionId) {
    return randomBytes(32).toString('hex');
  }
  // Without a server key, use the session ID directly as salt — tokens are within-session stable
  // but not server-hardened. Configure xpack.inference.anonymization.encryptionKey for HMAC-backed
  // tokens that are opaque even if the session ID is known.
  if (!serverSalt) {
    return sessionId;
  }
  return createHmac('sha256', serverSalt).update(`session:${sessionId}`).digest('hex');
};

export const createPiiTokenizationContext = ({
  detectionContext,
  serverSalt,
  sessionId,
}: {
  detectionContext: PiiDetectionContext;
  serverSalt?: string;
  sessionId?: string;
}): PiiTokenizationContext => {
  const executionScope = deriveExecutionScope({ serverSalt, sessionId });

  return {
    detectEntities: (options) => detectionContext.detectEntities(options),
    tokenize: (entityClass, value) => generateEntityToken(executionScope, entityClass, value),
  };
};
