/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const SHORT_EVIDENCE_MAX_LENGTH = 3;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Evidence matching helper:
 * - Normalizes whitespace on both sides so that newlines or extra spaces
 *   introduced (or removed) by the LLM don't cause false negatives.
 * - For very short evidence snippets (<= 3 chars), require token boundaries to avoid
 *   false positives (e.g. "GET" matching "TARGET").
 * - For longer evidence snippets, use a simple substring match.
 */
export function matchesEvidenceText(value: string, evidence: string): boolean {
  const normalizedEvidence = normalizeWhitespace(evidence);
  if (normalizedEvidence.length === 0) {
    return false;
  }

  const normalizedValue = normalizeWhitespace(value);
  if (normalizedEvidence.length <= SHORT_EVIDENCE_MAX_LENGTH) {
    return new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(normalizedEvidence)}($|[^a-zA-Z0-9_])`).test(
      normalizedValue
    );
  }

  return normalizedValue.includes(normalizedEvidence);
}
