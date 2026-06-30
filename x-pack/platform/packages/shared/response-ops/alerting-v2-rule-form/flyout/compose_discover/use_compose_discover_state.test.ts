/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createInitialState, reducer, getSandboxTabs } from './use_compose_discover_state';
import type { ComposeDiscoverState } from './types';

const createState = (overrides: Partial<ComposeDiscoverState> = {}): ComposeDiscoverState => ({
  ...createInitialState({ mode: 'create' }),
  ...overrides,
});

// ── createInitialState ────────────────────────────────────────────────────────

describe('createInitialState', () => {
  it('creates default state for create mode (alert)', () => {
    const state = createInitialState({ mode: 'create' });

    expect(state.mode).toBe('create');
    expect(state.childOpen).toBe(true);
    expect(state.queryCommitted).toBe(false);
    /*
     * Create uses a single unified editor (no split tabs), so the default tab
     * falls back to 'alert'.
     */
    expect(state.activeTab).toBe('alert');
  });

  it('starts on the alert tab for signal create (single editor)', () => {
    const state = createInitialState({ mode: 'create', initialKind: 'signal' });

    expect(state.activeTab).toBe('alert');
  });

  it('sets recoveryType to default when initialKind is alert', () => {
    const state = createInitialState({ mode: 'create', initialKind: 'alert' });

    expect(state.recoveryType).toBe('default');
  });

  it('sets childOpen false and queryCommitted true in edit mode', () => {
    const state = createInitialState({ mode: 'edit', initialKind: 'signal' });

    expect(state.childOpen).toBe(false);
    expect(state.queryCommitted).toBe(true);
  });

  it('sets recoveryType to default in edit mode with alert kind', () => {
    const state = createInitialState({ mode: 'edit', initialKind: 'alert' });

    expect(state.childOpen).toBe(false);
    expect(state.queryCommitted).toBe(true);
    expect(state.recoveryType).toBe('default');
  });

  it('applies initialRecoveryType only when kind is alert', () => {
    const withAlert = createInitialState({
      mode: 'edit',
      initialKind: 'alert',
      initialRecoveryType: 'custom',
    });
    expect(withAlert.recoveryType).toBe('custom');

    const withSignal = createInitialState({
      mode: 'edit',
      initialKind: 'signal',
      initialRecoveryType: 'custom',
    });
    expect(withSignal.recoveryType).toBe('default');
  });

  it('opens the query preview in create mode', () => {
    const state = createInitialState({ mode: 'create' });

    expect(state.childOpen).toBe(true);
    expect(state.queryCommitted).toBe(false);
  });

  it('sets queryCommitted true in create mode when isQueryPrePopulated is true', () => {
    const state = createInitialState({ mode: 'create', isQueryPrePopulated: true });

    expect(state.queryCommitted).toBe(true);
    expect(state.childOpen).toBe(true);
  });

  it('sets queryCommitted false when Discover query has no splittable alert condition', () => {
    const state = createInitialState({ mode: 'create', isQueryPrePopulated: false });

    expect(state.queryCommitted).toBe(false);
  });

  it('starts in YAML mode with sandbox open when forceYamlMode is true', () => {
    const state = createInitialState({ mode: 'edit', forceYamlMode: true });

    expect(state.yamlMode).toBe(true);
    expect(state.childOpen).toBe(true);
  });

  it('does not start in YAML mode when forceYamlMode is false', () => {
    const state = createInitialState({ mode: 'edit', forceYamlMode: false });

    expect(state.yamlMode).toBe(false);
    expect(state.childOpen).toBe(false);
  });
});

// ── reducer ───────────────────────────────────────────────────────────────────

describe('reducer', () => {
  describe('KIND_CHANGE', () => {
    it('kind=alert opens child on the base tab and resets to step 0', () => {
      const state = createState({ step: 2, childOpen: false, activeTab: 'alert' });
      const next = reducer(state, { type: 'KIND_CHANGE', kind: 'alert' });

      expect(next.childOpen).toBe(true);
      expect(next.step).toBe(0);
      expect(next.activeTab).toBe('base');
    });

    it('kind=signal keeps child open, resets step and recoveryType', () => {
      const state = createState({ step: 1, childOpen: true, recoveryType: 'custom' });
      const next = reducer(state, { type: 'KIND_CHANGE', kind: 'signal' });

      expect(next.childOpen).toBe(true);
      expect(next.step).toBe(0);
      expect(next.recoveryType).toBe('default');
    });
  });

  describe('COMMIT_QUERY', () => {
    it('marks queryCommitted and preserves childOpen', () => {
      const state = createState({ queryCommitted: false, childOpen: true, yamlMode: false });
      const next = reducer(state, { type: 'COMMIT_QUERY' });

      expect(next.queryCommitted).toBe(true);
      expect(next.childOpen).toBe(true);
    });

    it('keeps childOpen when in yaml mode', () => {
      const state = createState({ queryCommitted: false, childOpen: true, yamlMode: true });
      const next = reducer(state, { type: 'COMMIT_QUERY' });

      expect(next.queryCommitted).toBe(true);
      expect(next.childOpen).toBe(true);
    });
  });

  describe('SET_RECOVERY_TYPE', () => {
    it('opens child to recovery tab when switching to custom', () => {
      const state = createState({ recoveryType: 'default' });
      const next = reducer(state, { type: 'SET_RECOVERY_TYPE', recoveryType: 'custom' });

      expect(next.recoveryType).toBe('custom');
      expect(next.childOpen).toBe(true);
      expect(next.activeTab).toBe('recovery');
    });

    it('does not open child when switching to custom in builder mode', () => {
      const state = createState({ recoveryType: 'default', childOpen: false });
      const next = reducer(state, {
        type: 'SET_RECOVERY_TYPE',
        recoveryType: 'custom',
        isBuilderMode: true,
      });

      expect(next.recoveryType).toBe('custom');
      expect(next.childOpen).toBe(false);
    });

    it('does not open child when switching to default', () => {
      const state = createState({ recoveryType: 'custom', childOpen: false });
      const next = reducer(state, { type: 'SET_RECOVERY_TYPE', recoveryType: 'default' });

      expect(next.recoveryType).toBe('default');
      expect(next.childOpen).toBe(false);
    });
  });

  describe('SET_YAML_MODE', () => {
    it('opens child when enabling yaml mode', () => {
      const state = createState({ childOpen: false, yamlMode: false });
      const next = reducer(state, { type: 'SET_YAML_MODE', enabled: true });

      expect(next.yamlMode).toBe(true);
      expect(next.childOpen).toBe(true);
    });

    it('closes child when disabling yaml mode', () => {
      const state = createState({ childOpen: true, yamlMode: true });
      const next = reducer(state, { type: 'SET_YAML_MODE', enabled: false });

      expect(next.yamlMode).toBe(false);
      expect(next.childOpen).toBe(false);
    });
  });

  describe('GO_NEXT', () => {
    it('closes preview when advancing in non-builder mode', () => {
      const state = createState({ step: 0, childOpen: true });
      const next = reducer(state, { type: 'GO_NEXT', isAlert: true });

      expect(next.step).toBe(1);
      expect(next.childOpen).toBe(false);
    });

    it('preserves preview state when advancing in builder mode', () => {
      const state = createState({ step: 0, childOpen: true });
      const next = reducer(state, { type: 'GO_NEXT', isAlert: true, isBuilderMode: true });

      expect(next.step).toBe(1);
      expect(next.childOpen).toBe(true);
    });

    it('keeps preview closed if user closed it in builder mode', () => {
      const state = createState({ step: 0, childOpen: false });
      const next = reducer(state, { type: 'GO_NEXT', isAlert: true, isBuilderMode: true });

      expect(next.step).toBe(1);
      expect(next.childOpen).toBe(false);
    });
  });

  describe('GO_BACK', () => {
    it('closes preview when going back in non-builder mode', () => {
      const state = createState({ step: 2, childOpen: true });
      const next = reducer(state, { type: 'GO_BACK' });

      expect(next.step).toBe(1);
      expect(next.childOpen).toBe(false);
    });

    it('preserves preview state when going back in builder mode', () => {
      const state = createState({ step: 2, childOpen: true });
      const next = reducer(state, { type: 'GO_BACK', isBuilderMode: true });

      expect(next.step).toBe(1);
      expect(next.childOpen).toBe(true);
    });
  });

  describe('CLOSE_CHILD', () => {
    it('sets childOpen false without changing other fields', () => {
      const state = createState({ childOpen: true, queryCommitted: true });
      const next = reducer(state, { type: 'CLOSE_CHILD' });

      expect(next.childOpen).toBe(false);
      expect(next.queryCommitted).toBe(true);
    });
  });
});

// ── getSandboxTabs ────────────────────────────────────────────────────────────

describe('getSandboxTabs', () => {
  it('returns undefined when isAlert is false', () => {
    const state = createState();
    expect(getSandboxTabs(false, state)).toBeUndefined();
  });

  it('returns undefined on alertCondition step in create mode (single unified editor)', () => {
    const state = createState({ step: 0, mode: 'create' });
    expect(getSandboxTabs(true, state)).toBeUndefined();
  });

  it('returns [base, alert] on alertCondition step in edit mode', () => {
    const state = createState({ step: 0, mode: 'edit' });
    expect(getSandboxTabs(true, state)).toEqual(['base', 'alert']);
  });

  it('returns [recovery] on recoveryCondition step with custom recovery', () => {
    const state = createState({ step: 1, recoveryType: 'custom' });
    expect(getSandboxTabs(true, state)).toEqual(['recovery']);
  });

  it('returns undefined on recoveryCondition step with default recovery', () => {
    const state = createState({ step: 1, recoveryType: 'default' });
    expect(getSandboxTabs(true, state)).toBeUndefined();
  });
});
