/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with,
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const KIBANA_ON_MERGE_PIPELINE_SLUG = 'kibana-on-merge';
export const KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME = 'kibana-default.tar.zst';
export const BASELINE_ANCESTOR_LOOKUP_LIMIT = 10;

export type BaselineBuildOutcome =
  | 'accepted'
  | 'no_build'
  | 'build_not_passed'
  | 'missing_distributable_artifact';

export interface BaselineBuildkiteBuild {
  readonly id: string;
  readonly state: string;
  readonly number: number;
  readonly web_url: string;
  readonly commit: string;
}

export interface BaselineBuildkiteArtifact {
  readonly filename: string;
  readonly path: string;
}

export interface BaselineBuildkiteClient {
  getBuildForCommit: (
    pipelineSlug: string,
    commitSha: string
  ) => Promise<BaselineBuildkiteBuild | null>;
  getArtifacts: (pipelineSlug: string, buildNumber: number) => Promise<BaselineBuildkiteArtifact[]>;
}

export interface ResolveBaselineBuildAttempt {
  readonly commitSha: string;
  readonly attempt: number;
  readonly outcome: BaselineBuildOutcome;
  readonly buildId?: string;
  readonly buildNumber?: number;
  readonly buildUrl?: string;
}

export interface ResolvedBaselineBuild {
  readonly kind: 'resolved';
  readonly mergeBaseCommitSha: string;
  readonly baselineCommitSha: string;
  readonly pipelineSlug: typeof KIBANA_ON_MERGE_PIPELINE_SLUG;
  readonly buildId: string;
  readonly buildNumber: number;
  readonly buildUrl: string;
  readonly attemptCount: number;
}

export interface UnavailableBaselineBuild {
  readonly kind: 'unavailable';
  readonly mergeBaseCommitSha: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly attempts: readonly ResolveBaselineBuildAttempt[];
}

export type ResolveBaselineBuildResult = ResolvedBaselineBuild | UnavailableBaselineBuild;

export interface ResolveBaselineBuildOptions {
  readonly mergeBaseCommitSha: string;
  readonly buildkite: BaselineBuildkiteClient;
  readonly getFirstParentCommitSha: (commitSha: string) => Promise<string | null>;
  readonly maxAttempts?: number;
}

const hasReusableKibanaDistributableArtifact = (
  artifacts: readonly BaselineBuildkiteArtifact[]
): boolean => {
  return artifacts.some(
    (artifact) =>
      artifact.filename === KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME ||
      artifact.path === KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME ||
      artifact.path.endsWith(`/${KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME}`)
  );
};

const evaluateBaselineCandidate = async ({
  buildkite,
  commitSha,
  attempt,
}: {
  buildkite: BaselineBuildkiteClient;
  commitSha: string;
  attempt: number;
}): Promise<ResolveBaselineBuildAttempt> => {
  const build = await buildkite.getBuildForCommit(KIBANA_ON_MERGE_PIPELINE_SLUG, commitSha);

  if (!build) {
    return {
      commitSha,
      attempt,
      outcome: 'no_build',
    };
  }

  const buildDetails = {
    buildId: build.id,
    buildNumber: build.number,
    buildUrl: build.web_url,
  };

  if (build.state !== 'passed') {
    return {
      commitSha,
      attempt,
      outcome: 'build_not_passed',
      ...buildDetails,
    };
  }

  const artifacts = await buildkite.getArtifacts(KIBANA_ON_MERGE_PIPELINE_SLUG, build.number);

  if (!hasReusableKibanaDistributableArtifact(artifacts)) {
    return {
      commitSha,
      attempt,
      outcome: 'missing_distributable_artifact',
      ...buildDetails,
    };
  }

  return {
    commitSha,
    attempt,
    outcome: 'accepted',
    ...buildDetails,
  };
};

export const resolveBaselineBuild = async ({
  mergeBaseCommitSha,
  buildkite,
  getFirstParentCommitSha,
  maxAttempts = BASELINE_ANCESTOR_LOOKUP_LIMIT,
}: ResolveBaselineBuildOptions): Promise<ResolveBaselineBuildResult> => {
  const attempts: ResolveBaselineBuildAttempt[] = [];
  let commitSha = mergeBaseCommitSha;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptResult = await evaluateBaselineCandidate({
      buildkite,
      commitSha,
      attempt,
    });
    attempts.push(attemptResult);

    if (
      attemptResult.outcome === 'accepted' &&
      attemptResult.buildId !== undefined &&
      attemptResult.buildNumber !== undefined &&
      attemptResult.buildUrl !== undefined
    ) {
      return {
        kind: 'resolved',
        mergeBaseCommitSha,
        baselineCommitSha: commitSha,
        pipelineSlug: KIBANA_ON_MERGE_PIPELINE_SLUG,
        buildId: attemptResult.buildId,
        buildNumber: attemptResult.buildNumber,
        buildUrl: attemptResult.buildUrl,
        attemptCount: attempt,
      };
    }

    if (attempt === maxAttempts) {
      break;
    }

    const parentCommitSha = await getFirstParentCommitSha(commitSha);
    if (!parentCommitSha) {
      break;
    }

    commitSha = parentCommitSha;
  }

  return {
    kind: 'unavailable',
    mergeBaseCommitSha,
    attemptCount: attempts.length,
    maxAttempts,
    attempts,
  };
};
