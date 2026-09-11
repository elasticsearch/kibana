/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * A single regex PII detection rule, as authored in a workflow definition.
 *
 * Deliberately independent of `RegexAnonymizationRule` in `@kbn/inference-common`:
 * that type belongs to the legacy text-level anonymization path and carries fields
 * (NER variants, mask types) this runtime does not implement. Rules here arrive from
 * workflow YAML, so the workflow step schema is the only contract that shapes them.
 */
export interface PiiRegexRule {
  /** Token prefix for matches of this rule, e.g. `EMAIL`, `HOST_NAME`. */
  entityClass: string;
  /** Regex pattern. RE2JS is tried first; native RegExp is used as a fallback for constructs RE2 does not support (lookahead, lookbehind, backreferences). */
  pattern: string;
  /**
   * Maximum length of an accepted match, in characters. Matches longer than this are
   * discarded. Use it to express length bounds that RE2 cannot encode as lookahead.
   */
  maxMatchLength?: number;
}

/** A single detected PII span, positioned against the unmodified input text. */
export interface PiiRegexMatch {
  /** Index of the rule that produced this match, preserving rule precedence. */
  ruleIndex: number;
  /** Index of the record within the payload's `records` array. */
  recordIndex: number;
  /** Key within the record whose value produced this match. */
  recordKey: string;
  /** Inclusive start offset within the original field value. */
  start: number;
  /** Exclusive end offset within the original field value. */
  end: number;
  /** The matched text, verbatim. */
  matchValue: string;
  /** `entityClass` of the rule that produced this match. */
  entityClass: string;
}

/** Payload handed to the regex worker pool. */
export interface PiiRegexWorkerTaskPayload {
  rules: readonly PiiRegexRule[];
  records: ReadonlyArray<Record<string, string>>;
}

/**
 * How the runtime reacts when a rule cannot be compiled or executed.
 *
 * `block` refuses to produce a partial result, so a broken rule fails the LLM call
 * rather than letting the PII class it was meant to catch through unmasked.
 * `allow_unsafe` logs and skips each invalid rule; valid rules still run and return their matches.
 * Infrastructure failures (timeout, queue saturation) return no matches only in `allow_unsafe` mode; in `block` mode they throw.
 */
export type PiiDetectionFailureMode = 'block' | 'allow_unsafe';
