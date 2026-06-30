/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Local shapes for the Streams HTTP API (no @kbn/streams-schema / @kbn/streamlang dependency).
 *
 * `getStreamDefinition` is typed narrowly (mostly `ingest` for wired/classic helpers). The HTTP
 * payload can include full `@kbn/streams-schema` fields (`type`, `name`, `description`, etc.).
 * When a test or package already depends on `@kbn/streams-schema` and needs a real definition type,
 * cast at the call site, for example:
 *
 * ```ts
 * import type { Streams } from '@kbn/streams-schema';
 * const { stream } = await apiServices.streams.getStreamDefinition('logs.otel');
 * useStream(stream as Streams.all.Definition);
 * ```
 */

export type RoutingStatus = 'enabled' | 'disabled';

export type StringOrNumberOrBoolean = string | number | boolean;

export interface RangeCondition {
  gt?: StringOrNumberOrBoolean;
  gte?: StringOrNumberOrBoolean;
  lt?: StringOrNumberOrBoolean;
  lte?: StringOrNumberOrBoolean;
}

export interface ShorthandBinaryFilterCondition {
  field: string;
  eq?: StringOrNumberOrBoolean;
  neq?: StringOrNumberOrBoolean;
  lt?: StringOrNumberOrBoolean;
  lte?: StringOrNumberOrBoolean;
  gt?: StringOrNumberOrBoolean;
  gte?: StringOrNumberOrBoolean;
  contains?: StringOrNumberOrBoolean;
  startsWith?: StringOrNumberOrBoolean;
  endsWith?: StringOrNumberOrBoolean;
  range?: RangeCondition;
  includes?: StringOrNumberOrBoolean;
}

export interface ShorthandUnaryFilterCondition {
  field: string;
  exists?: boolean;
}

export type FilterCondition = ShorthandBinaryFilterCondition | ShorthandUnaryFilterCondition;

export interface AndCondition {
  and: Condition[];
}

export interface OrCondition {
  or: Condition[];
}

export interface AlwaysCondition {
  always: {};
}

export interface NeverCondition {
  never: {};
}

export interface NotCondition {
  not: Condition;
}

export type Condition =
  | FilterCondition
  | AndCondition
  | OrCondition
  | NotCondition
  | NeverCondition
  | AlwaysCondition;

export interface StreamlangDSL {
  steps: unknown[];
}

export interface IngestStreamProcessing extends StreamlangDSL {
  updated_at?: string;
}

export interface WiredRoutingEntry {
  destination: string;
  where?: Condition;
  status?: RoutingStatus;
}

export interface WiredIngestShape {
  wired: {
    routing: WiredRoutingEntry[];
    fields: Record<string, unknown>;
  };
  processing: IngestStreamProcessing;
  lifecycle?: unknown;
  settings?: unknown;
  failure_store?: unknown;
}

export interface ClassicIngestShape {
  classic: {
    field_overrides?: Record<string, unknown>;
  };
  processing: IngestStreamProcessing;
  lifecycle?: unknown;
  settings?: unknown;
  failure_store?: unknown;
}

export interface WiredStreamDefinition {
  ingest: WiredIngestShape;
}

export interface ClassicStreamDefinition {
  ingest: ClassicIngestShape;
}

export type IngestStreamDefinition = WiredStreamDefinition | ClassicStreamDefinition;

/** Common fields present in every stream GET response beyond the ingest shape. */
export interface StreamCommonResponseFields {
  name?: string;
  type?: string;
  description?: string;
  dashboards?: string[];
  rules?: string[];
}

export interface StreamsIngestGetResponse {
  stream: IngestStreamDefinition & StreamCommonResponseFields;
}

export type IngestUpsertRequest = WiredIngestShape | ClassicIngestShape;

export const isWiredStreamDefinition = (stream: {
  ingest?: unknown;
}): stream is WiredStreamDefinition =>
  Boolean(
    stream &&
      typeof stream === 'object' &&
      'ingest' in stream &&
      typeof stream.ingest === 'object' &&
      stream.ingest &&
      'wired' in stream.ingest
  );

export const isClassicStreamDefinition = (stream: {
  ingest?: unknown;
}): stream is ClassicStreamDefinition =>
  Boolean(
    stream &&
      typeof stream === 'object' &&
      'ingest' in stream &&
      typeof stream.ingest === 'object' &&
      stream.ingest &&
      'classic' in stream.ingest
  );
