/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { goldenPathExamples } from './dataset';
import { cleanProfileProvidedAlertsExamples } from './datasets/clean_profile_provided_alerts';

/**
 * A rejudge joins recorded score documents back to dataset references on
 * `example.metadata.scenarioKey`. Golden documents carry `example.id = '0'` for
 * 11,512 of 11,993 attack-discovery rows, so the id cannot distinguish one
 * scenario from another.
 *
 * The five golden-path slices recorded no scenarioKey at all, which made them
 * permanently unreplayable: a rejudge would have graded all five against the
 * first scenario's ground truth. These tests pin the join key so a future
 * scenario cannot be added without one.
 */
describe('attack-discovery replay join keys', () => {
  const allExamples = [...goldenPathExamples, ...cleanProfileProvidedAlertsExamples];

  it('gives every golden-path example a scenarioKey', () => {
    const missing = goldenPathExamples.filter((example) => !example.metadata?.scenarioKey);
    expect(missing).toEqual([]);
  });

  it('keys every example uniquely across the whole suite', () => {
    // Two scenarios sharing a key silently merge into one replay cell, and the
    // loser gets graded against the winner's reference.
    const keys = allExamples.map((example) => example.metadata?.scenarioKey);
    expect(new Set(keys).size).toBe(allExamples.length);
  });

  it('matches the scenarioKey to the fixture each golden-path example exercises', () => {
    // The suite already sliced these by `metadata.fixture`; the join key has to
    // agree with that slicing or a replay reunites slices the spec separated.
    const pairs = goldenPathExamples.map((example) => [
      example.metadata?.fixture,
      example.metadata?.scenarioKey,
    ]);
    expect(pairs).toEqual([
      ['provided-alerts', 'provided-alerts'],
      ['live-retrieval', 'live-retrieval'],
      ['multiple-alert-sets', 'multiple-alert-sets'],
      ['missing-alert-retrieval', 'missing-alert-retrieval'],
      ['status-only', 'status-only'],
    ]);
  });

  it('keeps every scenarioKey a non-empty string', () => {
    const bad = allExamples.filter(
      (example) =>
        typeof example.metadata?.scenarioKey !== 'string' ||
        (example.metadata?.scenarioKey as string).trim() === ''
    );
    expect(bad).toEqual([]);
  });
});
