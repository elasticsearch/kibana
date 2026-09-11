/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Fs from 'fs';
import Path from 'path';
import type { EvalsSuiteMetadataEntry } from './eval_pipeline';

// Reads the real config, unlike `eval_pipeline.test.ts` which mocks `fs` with a fixture. These
// mistakes are only reachable by hand-editing the file, so a PR-time check is the cheapest guard.
const suites = (
  JSON.parse(Fs.readFileSync(Path.join(__dirname, 'evals.suites.json'), 'utf-8')) as {
    suites: EvalsSuiteMetadataEntry[];
  }
).suites;

const shardedSuites = suites.filter((suite) => (suite.shards?.length ?? 0) > 0);

// `run_suite.sh` lowercases the id and rewrites every other character to `-` to build the step key,
// so ids outside this set are not distinct from each other once keyed. Requiring the safe form up
// front keeps the id and the key identical, with no transform to reason about.
const STEP_KEY_SAFE_ID = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

// Module-private in `eval_pipeline.ts`, which keys each suite step as
// `kbn-evals-${normalizeBuildkiteKey(suite.id)}`; `run_suite.sh` keeps a `tr`/`sed` copy.
const normalizeBuildkiteKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

describe('evals.suites.json suite ids', () => {
  it('keys every suite to a distinct Buildkite step', () => {
    // Duplicate keys make Buildkite reject the pipeline upload, so no suite runs at all. Raw id
    // comparison would miss `security/tuning` vs `security-tuning`: two strings, one key.
    const owners = new Map<string, string[]>();

    for (const { id } of suites) {
      const key = normalizeBuildkiteKey(id);
      owners.set(key, [...(owners.get(key) ?? []), id]);
    }

    const problems = [...owners]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => `step key "kbn-evals-${key}" is claimed by [${ids.join(', ')}]`);

    expect(problems).toEqual([]);
  });

  it('gives every suite an id that survives step-key slugification', () => {
    // A slugified id still runs, but its step key stops matching the id `EVAL_SUITE_ID` and the
    // Slack summary report, naming a suite that appears nowhere in this file.
    const problems = suites
      .filter(({ id }) => !STEP_KEY_SAFE_ID.test(id))
      .map(({ id }) => `suite id "${id}" is not lowercase [a-z0-9_-]`);

    expect(problems).toEqual([]);
  });
});

describe('evals.suites.json shards', () => {
  it('gives every shard an id that survives step-key slugification, unique within its suite', () => {
    const problems: string[] = [];

    for (const { id: suiteId, shards = [] } of shardedSuites) {
      const seen = new Set<string>();

      shards.forEach((shard, index) => {
        const shardId = shard.id?.trim();
        if (!shardId) {
          // An empty id leaves the step key unsuffixed, so two of them collide and Buildkite
          // rejects the whole fanout upload.
          problems.push(`${suiteId}: shard at index ${index} has no id`);
          return;
        }
        if (!STEP_KEY_SAFE_ID.test(shardId)) {
          // e.g. `feature/a` and `feature-a` both key as `feature-a`, colliding the step keys and
          // merging the two shards' failure-log metadata.
          problems.push(`${suiteId}: shard id "${shardId}" is not lowercase [a-z0-9_-]`);
        }
        if (seen.has(shardId)) {
          problems.push(`${suiteId}: duplicate shard id "${shardId}"`);
        }
        seen.add(shardId);
      });
    }

    expect(problems).toEqual([]);
  });

  it('gives every shard at least one spec file to run', () => {
    const problems = shardedSuites.flatMap(({ id: suiteId, shards = [] }) =>
      shards
        // A shard with no spec files runs the whole suite, overlapping every other shard.
        .filter((shard) => !shard.specFiles?.length)
        .map((shard) => `${suiteId}: shard "${shard.id}" lists no specFiles`)
    );

    expect(problems).toEqual([]);
  });

  it('keeps spec file paths safe to interpolate into the fanout pipeline', () => {
    // The paths are space-joined into one env var and re-split by the fanout step, then written
    // into a double-quoted YAML scalar that Buildkite interpolates. Whitespace would split one path
    // into two; `\` and `"` would break the scalar; `$` would be substituted away.
    const problems = shardedSuites.flatMap(({ id: suiteId, shards = [] }) =>
      shards.flatMap((shard) =>
        (shard.specFiles ?? [])
          .filter((specFile) => !/^[\w./-]+\.spec\.ts$/.test(specFile))
          .map((specFile) => `${suiteId}: shard "${shard.id}" has unsafe specFile "${specFile}"`)
      )
    );

    expect(problems).toEqual([]);
  });

  it('names a serverConfigSet that Scout can resolve to a real config set', () => {
    // `getConfigRootDir` joins config_sets/<serverConfigSet>/<arch>, and falls back to
    // config_sets/default when the name is absent -- a typo therefore boots the DEFAULT stack
    // (no tracing, no feature flags) instead of failing, and every trace-based evaluator
    // silently scores 0.
    const configSetsRoot = Path.resolve(
      __dirname,
      '../../../src/platform/packages/shared/kbn-scout/src/servers/configs/config_sets'
    );

    const problems = suites
      .filter(
        (suite): suite is EvalsSuiteMetadataEntry & { serverConfigSet: string } =>
          suite.serverConfigSet !== undefined
      )
      .filter(({ serverConfigSet }) => !Fs.existsSync(Path.join(configSetsRoot, serverConfigSet)))
      .map(
        ({ id, serverConfigSet }) => `${id}: serverConfigSet "${serverConfigSet}" does not exist`
      );

    expect(problems).toEqual([]);
  });

  it('never lists the same spec file in two shards of a suite', () => {
    const problems = shardedSuites.flatMap(({ id: suiteId, shards = [] }) => {
      const owners = new Map<string, string[]>();

      for (const shard of shards) {
        for (const specFile of shard.specFiles ?? []) {
          owners.set(specFile, [...(owners.get(specFile) ?? []), shard.id]);
        }
      }

      return [...owners]
        .filter(([, shardIds]) => shardIds.length > 1)
        .map(([specFile, shardIds]) => `${suiteId}: "${specFile}" is in [${shardIds.join(', ')}]`);
    });

    expect(problems).toEqual([]);
  });
});
