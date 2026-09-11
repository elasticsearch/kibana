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

    expect(state.childOpen).toBe(false);
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

  it('sets childOpen false and queryCommitted true in edit mode', () => {
    const state = createInitialState({ mode: 'edit', initialKind: 'signal' });

    expect(state.childOpen).toBe(false);
    expect(state.queryCommitted).toBe(true);
  });

  it('sets queryCommitted true in clone mode without aliasing clone to edit', () => {
    const state = createInitialState({ mode: 'clone', initialKind: 'signal' });

    expect(state.queryCommitted).toBe(true);
  });

  it('keeps the query sandbox closed in create mode', () => {
    const state = createInitialState({ mode: 'create' });

    expect(state.childOpen).toBe(false);
    expect(state.queryCommitted).toBe(false);
  });

  it('sets queryCommitted true in create mode when isQueryPrePopulated is true', () => {
    const state = createInitialState({ mode: 'create', isQueryPrePopulated: true });

    expect(state.queryCommitted).toBe(true);
    expect(state.childOpen).toBe(false);
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
    it('kind=alert keeps the current step and does not force the sandbox open', () => {
      const state = createState({ step: 2, childOpen: false, activeTab: 'alert' });
      const next = reducer(state, { type: 'KIND_CHANGE', kind: 'alert' });

      expect(next.childOpen).toBe(false);
      expect(next.step).toBe(2);
      expect(next.activeTab).toBe('base');
    });

    it('kind=signal keeps the current step and childOpen', () => {
      const state = createState({ step: 1, childOpen: true });
      const next = reducer(state, { type: 'KIND_CHANGE', kind: 'signal' });

      expect(next.childOpen).toBe(true);
      expect(next.step).toBe(1);
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

  describe('OPEN_CHILD', () => {
    it('focuses the tab passed as focusedTab', () => {
      const state = createState({ step: 1 });
      const next = reducer(state, { type: 'OPEN_CHILD', isAlert: true, focusedTab: 'recovery' });

      expect(next.childOpen).toBe(true);
      expect(next.activeTab).toBe('recovery');
    });

    it('falls back to the step default tab when focusedTab is omitted', () => {
      const state = createState({ step: 1, activeTab: 'recovery' });
      const next = reducer(state, { type: 'OPEN_CHILD', isAlert: true });

      expect(next.childOpen).toBe(true);
      expect(next.activeTab).toBe('alert');
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
    expect(
      getSandboxTabs(false, { step: 0, hasCustomRecovery: false, manualSplitEnabled: false })
    ).toBeUndefined();
  });

  it('returns undefined on alertCondition step (unified editor by default)', () => {
    expect(
      getSandboxTabs(true, { step: 0, hasCustomRecovery: false, manualSplitEnabled: false })
    ).toBeUndefined();
  });

  it('returns [base, alert] on alertCondition step when manualSplitEnabled', () => {
    expect(
      getSandboxTabs(true, { step: 0, hasCustomRecovery: false, manualSplitEnabled: true })
    ).toEqual(['base', 'alert']);
  });

  it('returns [recovery] on outcome step with custom recovery', () => {
    expect(
      getSandboxTabs(true, { step: 1, hasCustomRecovery: true, manualSplitEnabled: false })
    ).toEqual(['recovery']);
  });

  it('returns undefined on outcome step without custom recovery', () => {
    expect(
      getSandboxTabs(true, { step: 1, hasCustomRecovery: false, manualSplitEnabled: false })
    ).toBeUndefined();
  });
});

// ── ENABLE_MANUAL_SPLIT / DISABLE_MANUAL_SPLIT ────────────────────────────────

describe('reducer — manual split actions', () => {
  it('initializes manualSplitEnabled to false', () => {
    const state = createInitialState({ mode: 'create' });
    expect(state.manualSplitEnabled).toBe(false);
  });

  it('ENABLE_MANUAL_SPLIT sets manualSplitEnabled to true and switches to base tab', () => {
    const state = createState({ manualSplitEnabled: false, activeTab: 'alert' });
    const next = reducer(state, { type: 'ENABLE_MANUAL_SPLIT' });
    expect(next.manualSplitEnabled).toBe(true);
    expect(next.activeTab).toBe('base');
  });

  it('DISABLE_MANUAL_SPLIT sets manualSplitEnabled to false and returns to unified tab', () => {
    const state = createState({ manualSplitEnabled: true, activeTab: 'base' });
    const next = reducer(state, { type: 'DISABLE_MANUAL_SPLIT' });
    expect(next.manualSplitEnabled).toBe(false);
    expect(next.activeTab).toBe('alert');
  });

  it('SET_YAML_MODE clears manualSplitEnabled when entering YAML', () => {
    const state = createState({ manualSplitEnabled: true });
    const next = reducer(state, { type: 'SET_YAML_MODE', enabled: true });
    expect(next.manualSplitEnabled).toBe(false);
    expect(next.yamlMode).toBe(true);
  });

  it('SET_YAML_MODE does not change manualSplitEnabled when exiting YAML', () => {
    const state = createState({ manualSplitEnabled: false, yamlMode: true });
    const next = reducer(state, { type: 'SET_YAML_MODE', enabled: false });
    expect(next.manualSplitEnabled).toBe(false);
    expect(next.yamlMode).toBe(false);
  });

  it('KIND_CHANGE resets manualSplitEnabled to false', () => {
    const state = createState({ manualSplitEnabled: true });

    const toAlert = reducer(state, { type: 'KIND_CHANGE', kind: 'alert' });
    expect(toAlert.manualSplitEnabled).toBe(false);

    const toSignal = reducer(state, { type: 'KIND_CHANGE', kind: 'signal' });
    expect(toSignal.manualSplitEnabled).toBe(false);
  });
});
