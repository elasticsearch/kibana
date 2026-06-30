/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Discovery, SignificantEvent } from '@kbn/significant-events-schema';

/**
 * The discovery investigator/judge agents have no emit tool and no enforced `structured_output` on
 * the public converse API, so (per their instructions) they return their result as a single JSON
 * object in the final assistant `message`. These helpers recover that array. Conformance of each
 * item is graded separately by the `schema_validity` evaluator, so parsing casts loosely and returns
 * `[]` when the message is missing or not valid JSON.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Extract the first top-level JSON object from an assistant message. Tolerates a ```json fenced
 * block or stray prose around the object by slicing between the outermost braces.
 */
function extractJsonObject(message: string): Record<string, unknown> | undefined {
  if (!message) {
    return undefined;
  }

  const fenced = message.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : message;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseArrayProperty<T>(message: string, key: string): T[] {
  const obj = extractJsonObject(message);
  const value = obj?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Parse the investigator's `{ "discoveries": [...] }` message into `Discovery[]`. */
export function parseDiscoveries(message: string): Discovery[] {
  return parseArrayProperty<Discovery>(message, 'discoveries');
}

/** Parse the judge's `{ "significant_events": [...] }` message into `SignificantEvent[]`. */
export function parseSignificantEvents(message: string): SignificantEvent[] {
  return parseArrayProperty<SignificantEvent>(message, 'significant_events');
}
