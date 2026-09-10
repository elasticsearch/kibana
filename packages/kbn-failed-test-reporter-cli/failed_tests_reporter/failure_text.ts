/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { REPO_ROOT } from '@kbn/repo-info';

// `REPO_ROOT` covers the usual case of running from the checkout under test. Reports can also be
// processed elsewhere (see the README), so the CI checkout layout is matched explicitly as well.
const BUILDKITE_CHECKOUT_RE =
  /\/opt\/buildkite-agent\/builds\/[^\s/]+\/[^\s/]+\/[^\s/]+\/kibana\//g;

/**
 * Rewrite absolute checkout paths as repository relative ones. A CI checkout path holds the agent
 * name, so this is what makes the same error compare equal across builds.
 */
export const toRepoRelativePaths = (text: string): string =>
  text.replaceAll(`${REPO_ROOT}/`, '').replace(BUILDKITE_CHECKOUT_RE, '');

const STACK_FRAME_RE = /^\s*at\s/;

// Frames in the Node runtime, Mocha, or the WebDriver client never point at the code under test.
const INTERNAL_STACK_FRAME_RE =
  /\((?:node:)?internal[/\\]|[(/\\]node_modules[/\\](?:mocha|selenium-webdriver|@wdio)[/\\]/;

const MAX_STACK_FRAMES = 6;

export interface TrimmedFailureText {
  summary: string;
  /** true when repository frames were left out, so the original is still worth offering */
  trimmed: boolean;
}

const stripTrailingBrace = (frame: string) => frame.replace(/\s*\{\s*$/, '');

/**
 * Reduce a JUnit failure blob to the part worth reading first: the error message, the frames that
 * point at repository code, and the inspected error properties.
 */
export const trimFailureText = (text: string): TrimmedFailureText => {
  const lines = text.split('\n');
  const firstFrame = lines.findIndex((line) => STACK_FRAME_RE.test(line));
  if (firstFrame === -1) {
    return { summary: text.trim(), trimmed: false };
  }

  let lastFrame = firstFrame;
  while (lastFrame + 1 < lines.length && STACK_FRAME_RE.test(lines[lastFrame + 1])) {
    lastFrame += 1;
  }

  const frames = lines.slice(firstFrame, lastFrame + 1);
  // `util.inspect` prints an error's own properties after the stack, opening that object at the end
  // of the last frame line ("at processTimers (...) {"), so the brace must survive frame removal.
  const opensProperties = /\{\s*$/.test(frames[frames.length - 1]);
  const repoFrames = frames.filter((frame) => !INTERNAL_STACK_FRAME_RE.test(frame));
  const keptFrames = repoFrames.slice(0, MAX_STACK_FRAMES).map(stripTrailingBrace);
  // Internal frames are dropped silently; offering them back would just repeat the summary.
  const hiddenFrames = repoFrames.length - keptFrames.length;

  const summary = [
    ...lines.slice(0, firstFrame),
    ...keptFrames,
    ...(hiddenFrames > 0
      ? [`    ... ${hiddenFrames} more stack frame${hiddenFrames === 1 ? '' : 's'} hidden`]
      : []),
    ...(opensProperties ? ['{'] : []),
    ...lines.slice(lastFrame + 1),
  ]
    .join('\n')
    .trim();

  return { summary, trimmed: hiddenFrames > 0 };
};
