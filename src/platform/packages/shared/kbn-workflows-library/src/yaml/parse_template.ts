/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import yaml from 'yaml';
import { ZodError } from '@kbn/zod/v4';
import { TemplateMetadataSchema } from '../schemas/template';
import type { TemplateMetadata } from '../types/catalog';

const METADATA_KEY = 'template-metadata';

/**
 * Reason a `parseTemplateYaml` call failed. Kept on the error so callers
 * (the server's library service, the catalog generator) can map to HTTP
 * responses or CI annotations without string-matching the message.
 */
export type TemplateParseErrorReason =
  | 'invalid-yaml'
  | 'invalid-root'
  | 'missing-metadata'
  | 'invalid-metadata';

export class TemplateParseError extends Error {
  constructor(
    message: string,
    public readonly reason: TemplateParseErrorReason,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TemplateParseError';
  }
}

export interface ParsedTemplate {
  metadata: TemplateMetadata;
  /** The workflow YAML, after stripping the `template-metadata` block. */
  body: Record<string, unknown>;
  /** The original YAML text, surfaced unmodified for preview. */
  raw: string;
}

export interface ParseTemplateOptions {
  /**
   * When `true`, unknown top-level `template-metadata` fields are stripped
   * rather than rejected. Used on the runtime consumption path (the server
   * fetching a body from the CDN) so a field added by a newer publisher does
   * not 503 a template the catalog already lists. Authoring / CI keeps the
   * default strict validation. Defaults to `false`.
   */
  lenient?: boolean;
}

/**
 * Parse a raw template YAML string into its `template-metadata` block (typed
 * and Zod-validated) and the remaining workflow body (preserved as-is).
 *
 * Throws `TemplateParseError` on any failure. The `reason` field distinguishes
 * structural failures (bad YAML, no root object, missing metadata block) from
 * schema failures (metadata present but malformed); the `cause` field carries
 * the underlying error (e.g. the `ZodError`) for diagnostics.
 */
export function parseTemplateYaml(
  raw: string,
  { lenient = false }: ParseTemplateOptions = {}
): ParsedTemplate {
  let doc: unknown;
  try {
    doc = yaml.parse(raw);
  } catch (err) {
    throw new TemplateParseError('Template YAML is not valid YAML.', 'invalid-yaml', err);
  }

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new TemplateParseError(
      'Template YAML must contain a mapping at the root.',
      'invalid-root'
    );
  }

  const root = doc as Record<string, unknown>;
  const metaRaw = root[METADATA_KEY];
  if (metaRaw === undefined || metaRaw === null) {
    throw new TemplateParseError(
      `Template YAML is missing the \`${METADATA_KEY}\` block.`,
      'missing-metadata'
    );
  }

  // Strict by default (authoring/CI: reject unknown fields). On the runtime
  // consumption path `lenient` strips unknown top-level `template-metadata`
  // keys instead, so a newer publisher field doesn't 503 a listed template.
  const metadataSchema = lenient ? TemplateMetadataSchema.strip() : TemplateMetadataSchema;
  let metadata: TemplateMetadata;
  try {
    metadata = metadataSchema.parse(metaRaw) as TemplateMetadata;
  } catch (err) {
    const message =
      err instanceof ZodError
        ? `Template metadata is invalid: ${formatZodIssues(err)}`
        : 'Template metadata is invalid.';
    throw new TemplateParseError(message, 'invalid-metadata', err);
  }

  const { [METADATA_KEY]: _omit, ...body } = root;
  return { metadata, body, raw };
}

function formatZodIssues(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
