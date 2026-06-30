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

import {
  BASELINE_ANCESTOR_LOOKUP_LIMIT,
  KIBANA_ON_MERGE_PIPELINE_SLUG,
  KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME,
  resolveBaselineBuild,
  type BaselineBuildkiteArtifact,
  type BaselineBuildkiteBuild,
  type BaselineBuildkiteClient,
} from './resolve_baseline_build';

const MERGE_BASE_SHA = 'a'.repeat(40);
const PARENT_SHA = 'b'.repeat(40);
const GRANDPARENT_SHA = 'c'.repeat(40);

const makeBuild = ({
  commit,
  state = 'passed',
  id = 'build-id',
  number = 123,
  web_url = 'https://buildkite.com/elastic/kibana-on-merge/builds/123',
}: {
  commit: string;
  state?: string;
  id?: string;
  number?: number;
  web_url?: string;
}): BaselineBuildkiteBuild => ({
  id,
  state,
  number,
  web_url,
  commit,
});

const makeDistributableArtifacts = (): BaselineBuildkiteArtifact[] => [
  {
    filename: KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME,
    path: KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME,
  },
];

const createMockBuildkiteClient = ({
  buildsByCommit = new Map<string, BaselineBuildkiteBuild | null>(),
  artifactsByBuildNumber = new Map<number, BaselineBuildkiteArtifact[]>(),
}: {
  buildsByCommit?: Map<string, BaselineBuildkiteBuild | null>;
  artifactsByBuildNumber?: Map<number, BaselineBuildkiteArtifact[]>;
} = {}): BaselineBuildkiteClient => ({
  getBuildForCommit: jest.fn(async (_pipelineSlug, commitSha) => {
    return buildsByCommit.get(commitSha) ?? null;
  }),
  getArtifacts: jest.fn(async (_pipelineSlug, buildNumber) => {
    return artifactsByBuildNumber.get(buildNumber) ?? [];
  }),
});

const createParentLookup = (parentsByCommit: Record<string, string | null>) => {
  return jest.fn(async (commitSha: string) => parentsByCommit[commitSha] ?? null);
};

describe('resolveBaselineBuild', () => {
  it('looks for the reusable zstd Kibana distributable artifact', () => {
    expect(KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME).toBe('kibana-default.tar.zst');
  });

  it('resolves the merge-base commit on the first attempt', async () => {
    const buildkite = createMockBuildkiteClient({
      buildsByCommit: new Map([[MERGE_BASE_SHA, makeBuild({ commit: MERGE_BASE_SHA })]]),
      artifactsByBuildNumber: new Map([[123, makeDistributableArtifacts()]]),
    });

    const result = await resolveBaselineBuild({
      mergeBaseCommitSha: MERGE_BASE_SHA,
      buildkite,
      getFirstParentCommitSha: createParentLookup({}),
    });

    expect(result).toEqual({
      kind: 'resolved',
      mergeBaseCommitSha: MERGE_BASE_SHA,
      baselineCommitSha: MERGE_BASE_SHA,
      pipelineSlug: KIBANA_ON_MERGE_PIPELINE_SLUG,
      buildId: 'build-id',
      buildNumber: 123,
      buildUrl: 'https://buildkite.com/elastic/kibana-on-merge/builds/123',
      attemptCount: 1,
    });
    expect(buildkite.getBuildForCommit).toHaveBeenCalledWith(
      KIBANA_ON_MERGE_PIPELINE_SLUG,
      MERGE_BASE_SHA
    );
    expect(buildkite.getArtifacts).toHaveBeenCalledWith(KIBANA_ON_MERGE_PIPELINE_SLUG, 123);
  });

  it('falls back to the first-parent ancestor when the merge-base build failed', async () => {
    const buildkite = createMockBuildkiteClient({
      buildsByCommit: new Map([
        [MERGE_BASE_SHA, makeBuild({ commit: MERGE_BASE_SHA, state: 'failed' })],
        [PARENT_SHA, makeBuild({ commit: PARENT_SHA, id: 'parent-build', number: 456 })],
      ]),
      artifactsByBuildNumber: new Map([[456, makeDistributableArtifacts()]]),
    });

    const result = await resolveBaselineBuild({
      mergeBaseCommitSha: MERGE_BASE_SHA,
      buildkite,
      getFirstParentCommitSha: createParentLookup({
        [MERGE_BASE_SHA]: PARENT_SHA,
      }),
    });

    expect(result).toMatchObject({
      kind: 'resolved',
      baselineCommitSha: PARENT_SHA,
      attemptCount: 2,
    });
  });

  it('falls back to the first-parent ancestor when the merge-base build is missing', async () => {
    const buildkite = createMockBuildkiteClient({
      buildsByCommit: new Map([
        [MERGE_BASE_SHA, null],
        [PARENT_SHA, makeBuild({ commit: PARENT_SHA, id: 'parent-build', number: 456 })],
      ]),
      artifactsByBuildNumber: new Map([[456, makeDistributableArtifacts()]]),
    });
    const getFirstParentCommitSha = createParentLookup({
      [MERGE_BASE_SHA]: PARENT_SHA,
    });

    const result = await resolveBaselineBuild({
      mergeBaseCommitSha: MERGE_BASE_SHA,
      buildkite,
      getFirstParentCommitSha,
    });

    expect(result).toEqual({
      kind: 'resolved',
      mergeBaseCommitSha: MERGE_BASE_SHA,
      baselineCommitSha: PARENT_SHA,
      pipelineSlug: KIBANA_ON_MERGE_PIPELINE_SLUG,
      buildId: 'parent-build',
      buildNumber: 456,
      buildUrl: 'https://buildkite.com/elastic/kibana-on-merge/builds/123',
      attemptCount: 2,
    });
    expect(getFirstParentCommitSha).toHaveBeenCalledWith(MERGE_BASE_SHA);
    expect(buildkite.getBuildForCommit).toHaveBeenNthCalledWith(
      1,
      KIBANA_ON_MERGE_PIPELINE_SLUG,
      MERGE_BASE_SHA
    );
    expect(buildkite.getBuildForCommit).toHaveBeenNthCalledWith(
      2,
      KIBANA_ON_MERGE_PIPELINE_SLUG,
      PARENT_SHA
    );
  });

  it('returns unavailable details when no baseline is found within the ancestor limit', async () => {
    const buildkite = createMockBuildkiteClient({
      buildsByCommit: new Map([
        [MERGE_BASE_SHA, makeBuild({ commit: MERGE_BASE_SHA, state: 'failed' })],
        [PARENT_SHA, null],
        [GRANDPARENT_SHA, makeBuild({ commit: GRANDPARENT_SHA, state: 'passed', number: 789 })],
      ]),
      artifactsByBuildNumber: new Map([[789, []]]),
    });
    const getFirstParentCommitSha = createParentLookup({
      [MERGE_BASE_SHA]: PARENT_SHA,
      [PARENT_SHA]: GRANDPARENT_SHA,
      [GRANDPARENT_SHA]: null,
    });

    const result = await resolveBaselineBuild({
      mergeBaseCommitSha: MERGE_BASE_SHA,
      buildkite,
      getFirstParentCommitSha,
      maxAttempts: 3,
    });

    expect(result).toEqual({
      kind: 'unavailable',
      mergeBaseCommitSha: MERGE_BASE_SHA,
      attemptCount: 3,
      maxAttempts: 3,
      attempts: [
        {
          commitSha: MERGE_BASE_SHA,
          attempt: 1,
          outcome: 'build_not_passed',
          buildId: 'build-id',
          buildNumber: 123,
          buildUrl: 'https://buildkite.com/elastic/kibana-on-merge/builds/123',
        },
        {
          commitSha: PARENT_SHA,
          attempt: 2,
          outcome: 'no_build',
        },
        {
          commitSha: GRANDPARENT_SHA,
          attempt: 3,
          outcome: 'missing_distributable_artifact',
          buildId: 'build-id',
          buildNumber: 789,
          buildUrl: 'https://buildkite.com/elastic/kibana-on-merge/builds/123',
        },
      ],
    });
    expect(getFirstParentCommitSha).toHaveBeenCalledTimes(2);
  });

  it('walks at most ten first-parent ancestors by default', async () => {
    const buildkite = createMockBuildkiteClient();
    const parentsByCommit: Record<string, string | null> = {};
    let commitSha = MERGE_BASE_SHA;

    for (let index = 0; index < BASELINE_ANCESTOR_LOOKUP_LIMIT; index++) {
      const parentSha = `${index}`.padStart(40, 'd');
      parentsByCommit[commitSha] = parentSha;
      commitSha = parentSha;
    }
    parentsByCommit[commitSha] = `${BASELINE_ANCESTOR_LOOKUP_LIMIT}`.padStart(40, 'e');

    const result = await resolveBaselineBuild({
      mergeBaseCommitSha: MERGE_BASE_SHA,
      buildkite,
      getFirstParentCommitSha: createParentLookup(parentsByCommit),
    });

    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') {
      expect(result.attemptCount).toBe(BASELINE_ANCESTOR_LOOKUP_LIMIT);
      expect(result.maxAttempts).toBe(BASELINE_ANCESTOR_LOOKUP_LIMIT);
      expect(result.attempts).toHaveLength(BASELINE_ANCESTOR_LOOKUP_LIMIT);
      expect(result.attempts.every((attempt) => attempt.outcome === 'no_build')).toBe(true);
    }
    expect(buildkite.getBuildForCommit).toHaveBeenCalledTimes(BASELINE_ANCESTOR_LOOKUP_LIMIT);
  });
});
