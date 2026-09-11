/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { JudgeScore } from '@kbn/evals-common';

/**
 * Reads one `label=score` per line. The score is taken after the last `=`, so a
 * label may contain one. Returns undefined if any line is malformed, because a
 * partially understood scale would score a judge against criteria nobody wrote.
 */
export const parseLabels = (value: string): JudgeScore['labels'] | undefined => {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return undefined;
  }

  const labels: NonNullable<JudgeScore['labels']> = [];
  for (const line of lines) {
    const separator = line.lastIndexOf('=');
    const label = line.slice(0, separator).trim();
    // `Number('')` is 0, so an omitted score would otherwise parse as a valid 0.
    const rawScore = line.slice(separator + 1).trim();
    const score = Number(rawScore);
    if (separator < 1 || !label || !rawScore) {
      return undefined;
    }
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      return undefined;
    }
    labels.push({ value: label, score });
  }
  return labels;
};
