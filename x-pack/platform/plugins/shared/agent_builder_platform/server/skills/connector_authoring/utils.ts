/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AgentBuilderConnectorFeatureId } from '@kbn/actions-plugin/common';
import type { ConnectorSpec } from '@kbn/connector-specs';

/**
 * Whether a connector spec declares Agent Builder support.
 */
export const supportsAgentBuilder = (spec: ConnectorSpec): boolean =>
  (spec.metadata.supportedFeatureIds as readonly string[]).includes(AgentBuilderConnectorFeatureId);
