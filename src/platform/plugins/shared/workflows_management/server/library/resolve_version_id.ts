/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import semver from 'semver';
import type { KibanaVersionsManifest } from '@kbn/workflows-library';

/**
 * Resolves which per-Kibana-version directory id (`9.5`, `main`, …) to read
 * from, given the runtime's own Kibana semver and deployment mode. Shared by
 * both source modes so HTTP (CDN) and bundle (local mirror) select the same
 * catalog for the same runtime.
 *
 * - Serverless deployments always resolve to {@link KibanaVersionsManifest.latest}
 *   (`main`) — serverless runs Kibana@HEAD and the `main` catalog tracks its
 *   semver.
 * - Stack deployments match against each manifest entry's explicit `kibana`
 *   semver, selecting the same minor (`~9.5.0` = `9.5.x`, patch-independent) —
 *   order-independent, unlike a caret range.
 * - Unrecognized runtime versions fall back to `manifest.latest` so dev builds
 *   against Kibana@HEAD still get a working catalog.
 */
export function resolveVersionId(
  kibanaVersion: string,
  isServerless: boolean,
  manifest: KibanaVersionsManifest
): string {
  if (isServerless) {
    return manifest.latest;
  }
  for (const entry of manifest.versions) {
    if (semver.satisfies(kibanaVersion, `~${entry.kibana}`)) {
      return entry.id;
    }
  }
  return manifest.latest;
}
