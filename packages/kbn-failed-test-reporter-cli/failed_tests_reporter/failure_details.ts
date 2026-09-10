/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/* Formatting shared by the GitHub issue bodies and the HTML failure report. */

export const NOT_AVAILABLE = 'N/A';

/**
 * Normalize a comma separated list of code owners so it renders consistently
 * regardless of whether the source joined with `,` (FTR) or `, ` (Scout).
 */
export function formatOwners(owners?: string): string {
  if (!owners) {
    return NOT_AVAILABLE;
  }
  const normalized = owners
    .split(',')
    .map((owner) => owner.trim())
    .filter(Boolean)
    .join(', ');
  return normalized || NOT_AVAILABLE;
}

export function formatDurationSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

/**
 * Duration is reported as a seconds string in JUnit reports, but is not always
 * present (and unit tests may pass non-numeric values).
 */
export function formatDurationFromTime(time?: string): string {
  if (!time) {
    return NOT_AVAILABLE;
  }
  const seconds = Number(time);
  return Number.isFinite(seconds) ? formatDurationSeconds(seconds) : NOT_AVAILABLE;
}

/**
 * Extract the config path from a command line, e.g. the Playwright/FTR `--config` flag.
 */
export function getConfigPathFromCommandLine(command?: string): string {
  if (!command) return NOT_AVAILABLE;
  const configMatch = command.match(/--config(?:=|\s+)(\S+)/);
  return configMatch ? configMatch[1] : NOT_AVAILABLE;
}
