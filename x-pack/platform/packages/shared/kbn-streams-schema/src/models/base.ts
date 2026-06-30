/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { OmitUpsertProps } from './core';

/* eslint-disable @typescript-eslint/no-namespace */
export namespace BaseStream {
  export interface QueryStreamReference {
    name: string;
  }

  export interface Definition {
    name: string;
    description: string;
    updated_at: string;
    /**
     * Child query streams (virtual, read-only ES|QL view streams) that belong to this stream.
     * Names must follow the parent.childname naming convention. These are not significant-event
     * queries (`StreamQuery`); those live outside the stream payload (see `GetResponse`).
     */
    query_streams?: QueryStreamReference[];
  }

  export type Source<TDefinition extends Definition = Definition> = TDefinition;

  /**
   * Stream read model. Significant-event queries are intentionally not included here; fetch
   * them via `GET /api/streams/{name}/queries`.
   */
  export interface GetResponse<TDefinition extends Definition = Definition> {
    dashboards: string[];
    rules: string[];
    stream: TDefinition;
  }

  /**
   * Stream write model. Significant-event queries are intentionally not part of the upsert;
   * manage them via the `/api/streams/{name}/queries` endpoints. The `PUT` routes validate the
   * body with `DeepStrict`, so a stray `queries` field is rejected as an unrecognized key (HTTP
   * 400); the GET→PUT converter (`convertGetResponseIntoUpsertRequest`) never emits one.
   */
  export interface UpsertRequest<TDefinition extends Definition = Definition> {
    dashboards: string[];
    rules: string[];
    stream: OmitUpsertProps<TDefinition>;
  }

  export interface Model {
    Definition: BaseStream.Definition;
    Source: BaseStream.Source;
    GetResponse: BaseStream.GetResponse;
    UpsertRequest: BaseStream.UpsertRequest;
  }
}

export const baseStreamDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  updated_at: z.iso.datetime(),
  query_streams: z
    .array(
      z.object({
        name: z.string(),
      })
    )
    .optional(),
});

export const baseStreamGetResponseSchema = z.object({
  dashboards: z.array(z.string()),
  rules: z.array(z.string()),
});

export const baseStreamUpsertRequestSchema = z.object({
  dashboards: z.array(z.string()),
  rules: z.array(z.string()),
});

export const baseStreamUpsertDefinitionSchema = baseStreamDefinitionSchema.omit({
  name: true,
  updated_at: true,
});
