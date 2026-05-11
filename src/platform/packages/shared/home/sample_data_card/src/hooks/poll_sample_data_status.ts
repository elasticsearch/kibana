/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import pRetry from 'p-retry';
import type { SampleDataSet, InstalledStatus } from '@kbn/home-sample-data-types';

/**
 * Options for polling sample data status after installation or removal.
 */
export interface PollOptions {
  /**
   * Maximum number of retry attempts (default: 10)
   */
  maxAttempts?: number;

  /**
   * Initial delay before first check in milliseconds
   */
  initialDelayMs?: number;

  /**
   * Minimum time between poll attempts in milliseconds
   */
  minTimeout?: number;

  /**
   * Factor for exponential backoff (default: 1.5)
   */
  factor?: number;

  /**
   * Callback for logging failed attempts
   */
  onFailedAttempt?: (error: Error, attemptNumber: number) => void;
}

/**
 * Poll the sample data list endpoint until the dataset reaches the desired status.
 */
async function pollSampleDataStatus(
  id: string,
  pollFor: 'installation' | 'removal',
  fetchSampleDataSets: () => Promise<SampleDataSet[]>,
  options: PollOptions = {}
): Promise<void> {
  const {
    maxAttempts = 10,
    initialDelayMs = pollFor === 'installation' ? 1000 : 500,
    minTimeout = pollFor === 'installation' ? 1000 : 500,
    factor = 1.5,
    onFailedAttempt,
  } = options;

  await new Promise((resolve) => setTimeout(resolve, initialDelayMs));

  await pRetry(
    async () => {
      const dataSets = await fetchSampleDataSets();
      const dataset = dataSets.find((ds) => ds.id === id);

      // Check if target status is reached
      const isComplete =
        pollFor === 'installation'
          ? dataset?.status === 'installed'
          : !dataset || dataset?.status === 'not_installed';

      if (isComplete) {
        return;
      }

      // Build error message based on operation
      const statusMessage =
        pollFor === 'installation'
          ? `not yet installed (status: ${dataset?.status})`
          : `still installed (status: ${dataset?.status})`;

      throw new Error(`Sample data set ${id} ${statusMessage}`);
    },
    {
      retries: maxAttempts,
      minTimeout,
      factor,
      onFailedAttempt: (error) => {
        if (onFailedAttempt) {
          onFailedAttempt(error, error.attemptNumber);
        }
        // eslint-disable-next-line no-console
        console.debug(
          `Poll attempt ${error.attemptNumber}/${maxAttempts} for ${id}:`,
          error.message
        );
      },
    }
  );
}

/**
 * Poll the sample data list endpoint until the dataset shows as installed.
 */
export async function pollForInstallation(
  id: string,
  fetchSampleDataSets: () => Promise<SampleDataSet[]>,
  options: PollOptions = {}
): Promise<void> {
  return pollSampleDataStatus(id, 'installation', fetchSampleDataSets, options);
}

/**
 * Poll the sample data list endpoint until the dataset shows as uninstalled.
 */
export async function pollForRemoval(
  id: string,
  fetchSampleDataSets: () => Promise<SampleDataSet[]>,
  options: PollOptions = {}
): Promise<void> {
  return pollSampleDataStatus(id, 'removal', fetchSampleDataSets, options);
}

/**
 * Poll using a custom status check function until the dataset reaches the desired status.
 */
async function pollCustomStatus(
  pollFor: 'installation' | 'removal',
  customStatusCheck: () => Promise<InstalledStatus>,
  options: PollOptions = {}
): Promise<void> {
  const defaultOptions =
    pollFor === 'installation'
      ? { maxAttempts: 60, initialDelayMs: 2000, minTimeout: 2000, factor: 1.2 }
      : { maxAttempts: 20, initialDelayMs: 500, minTimeout: 500, factor: 1.5 };

  const {
    maxAttempts = defaultOptions.maxAttempts,
    initialDelayMs = defaultOptions.initialDelayMs,
    minTimeout = defaultOptions.minTimeout,
    factor = defaultOptions.factor,
    onFailedAttempt,
  } = options;

  const targetStatus = pollFor === 'installation' ? 'installed' : 'not_installed';

  await new Promise((resolve) => setTimeout(resolve, initialDelayMs));

  await pRetry(
    async () => {
      const status = await customStatusCheck();

      if (status === targetStatus) {
        return;
      }

      const statusMessage =
        pollFor === 'installation'
          ? `Sample data set not yet installed (status: ${status})`
          : `Sample data set still installed (status: ${status})`;

      throw new Error(statusMessage);
    },
    {
      retries: maxAttempts,
      minTimeout,
      factor,
      onFailedAttempt: (error) => {
        if (onFailedAttempt) {
          onFailedAttempt(error, error.attemptNumber);
        }
        // eslint-disable-next-line no-console
        console.debug(`Custom poll attempt ${error.attemptNumber}/${maxAttempts}:`, error.message);
      },
    }
  );
}

/**
 * Poll using a custom status check function until the dataset shows as installed.
 */
export async function pollForCustomInstallation(
  customStatusCheck: () => Promise<InstalledStatus>,
  options: PollOptions = {}
): Promise<void> {
  return pollCustomStatus('installation', customStatusCheck, options);
}

/**
 * Poll using a custom status check function until the dataset shows as uninstalled.
 */
export async function pollForCustomRemoval(
  customStatusCheck: () => Promise<InstalledStatus>,
  options: PollOptions = {}
): Promise<void> {
  return pollCustomStatus('removal', customStatusCheck, options);
}
