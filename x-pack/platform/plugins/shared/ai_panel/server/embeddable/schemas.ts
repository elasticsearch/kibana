/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { serializedTitlesSchema } from '@kbn/presentation-publishing-schemas';

export const aiPanelStateSchema = schema.object({
  prompt: schema.string(),
  esqlQuery: schema.maybe(schema.string()),
  template: schema.maybe(schema.string()),
});

export const aiPanelEmbeddableSchema = schema.allOf([aiPanelStateSchema, serializedTitlesSchema]);

export type AiPanelState = TypeOf<typeof aiPanelStateSchema>;
export type AiPanelEmbeddableState = TypeOf<typeof aiPanelEmbeddableSchema>;
