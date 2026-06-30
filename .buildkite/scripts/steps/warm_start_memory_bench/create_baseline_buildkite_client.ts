/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { BaselineBuildkiteClient } from './resolve_baseline_build';
import type { BuildkiteClient } from '#pipeline-utils';

export const createBaselineBuildkiteClient = (
  buildkite: BuildkiteClient
): BaselineBuildkiteClient => ({
  getBuildForCommit: async (pipelineSlug, commitSha) => {
    const build = await buildkite.getBuildForCommit(pipelineSlug, commitSha);
    if (!build) {
      return null;
    }

    return {
      id: build.id,
      state: build.state,
      number: build.number,
      web_url: build.web_url,
      commit: build.commit,
    };
  },
  getArtifacts: async (pipelineSlug, buildNumber) => {
    const artifacts = await buildkite.getArtifacts(pipelineSlug, buildNumber);
    return artifacts.map((artifact) => ({
      filename: artifact.filename,
      path: artifact.path,
    }));
  },
});
