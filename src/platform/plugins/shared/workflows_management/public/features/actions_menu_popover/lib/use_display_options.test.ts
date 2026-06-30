/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildDisplayOptions, MAX_VISIBLE_STEPS, STEPS_PREFIX } from './use_display_options';
import type { EditorCommand, JumpToStepEntry, MenuSelectableOption } from '../types';

const makeAction = (id: string, label: string) => ({
  id,
  label,
  iconType: 'empty' as const,
});

const mockCommands: EditorCommand[] = [
  { id: 'foldAll', label: 'Collapse all', iconType: 'minusInCircle' },
  { id: 'unfoldAll', label: 'Expand all', iconType: 'plusInCircle' },
];

const mockJumps: JumpToStepEntry[] = [
  { id: 'step_one', label: '#step_one', lineStart: 5 },
  { id: 'step_two', label: '#step_two', lineStart: 15 },
  { id: 'alert_step', label: '#alert_step', lineStart: 25 },
];

const dataKinds = (result: MenuSelectableOption[]) =>
  result.filter((o) => !o.isGroupLabel).map((o) => o.data?.menuItem?.kind);

const groupLabels = (result: MenuSelectableOption[]) =>
  result.filter((o) => o.isGroupLabel).map((o) => o.label);

describe('buildDisplayOptions', () => {
  const base = {
    options: [] as ReturnType<typeof makeAction>[],
    searchTerm: '',
    commands: mockCommands,
    jumpToStepEntries: mockJumps,
    currentPath: [] as string[],
  };

  it('shows Add step + Commands sections when no search is active', () => {
    const result = buildDisplayOptions({ ...base, options: [makeAction('a', 'A')] });
    expect(groupLabels(result)).toEqual(['Add step', 'Commands']);
    expect(dataKinds(result)).toEqual(['action', 'command', 'command']);
  });

  it('hides Add step section when no actions match the search', () => {
    const result = buildDisplayOptions({ ...base, options: [], searchTerm: 'zzz' });
    expect(groupLabels(result)).not.toContain('Add step');
  });

  it('hides Add step section in Steps: mode when no actions match', () => {
    const result = buildDisplayOptions({
      ...base,
      options: [],
      searchTerm: `${STEPS_PREFIX}zzz`,
    });
    expect(groupLabels(result)).not.toContain('Add step');
    expect(result).toHaveLength(0);
  });

  it('returns action items directly when inside a sub-group', () => {
    const options = [makeAction('a', 'A')];
    const result = buildDisplayOptions({ ...base, options, currentPath: ['group1'] });
    expect(result).toHaveLength(1);
    expect(result[0].data?.menuItem).toEqual({ kind: 'action', action: options[0] });
  });

  describe('hash mode (#)', () => {
    it('shows only jump entries when search starts with #', () => {
      const result = buildDisplayOptions({ ...base, searchTerm: '#' });
      expect(groupLabels(result)).toEqual(['Jump to a step']);
      expect(dataKinds(result)).toEqual(['jump', 'jump', 'jump']);
    });

    it('filters jump entries by term after #', () => {
      const result = buildDisplayOptions({ ...base, searchTerm: '#alert' });
      const jumps = result.filter((o) => o.data?.menuItem?.kind === 'jump');
      expect(jumps).toHaveLength(1);
      expect(jumps[0].label).toBe('#alert_step');
    });

    it('excludes Commands and Add step sections', () => {
      const result = buildDisplayOptions({ ...base, searchTerm: '#' });
      expect(groupLabels(result)).not.toContain('Commands');
      expect(groupLabels(result)).not.toContain('Add step');
    });
  });

  describe('Steps: prefix mode', () => {
    it('shows all action options without limit', () => {
      const manyActions = Array.from({ length: 15 }, (_, i) =>
        makeAction(`act${i}`, `Action ${i}`)
      );
      const result = buildDisplayOptions({
        ...base,
        options: manyActions,
        searchTerm: `${STEPS_PREFIX}act`,
      });
      const actions = result.filter((o) => o.data?.menuItem?.kind === 'action');
      expect(actions).toHaveLength(15);
    });

    it('does not include Commands or Jump sections', () => {
      const result = buildDisplayOptions({
        ...base,
        options: [makeAction('a', 'A')],
        searchTerm: `${STEPS_PREFIX}a`,
      });
      expect(groupLabels(result)).toEqual(['Add step']);
    });
  });

  describe('normal search mode', () => {
    it('limits step options to MAX_VISIBLE_STEPS and adds viewAll nav', () => {
      const manyActions = Array.from({ length: 15 }, (_, i) =>
        makeAction(`act${i}`, `Action ${i}`)
      );
      const result = buildDisplayOptions({
        ...base,
        options: manyActions,
        searchTerm: 'act',
      });
      const actions = result.filter((o) => o.data?.menuItem?.kind === 'action');
      expect(actions).toHaveLength(MAX_VISIBLE_STEPS);
      const nav = result.find(
        (o) => o.data?.menuItem?.kind === 'nav' && o.data.menuItem.target === 'viewAll'
      );
      expect(nav).toBeDefined();
    });

    it('shows matching commands', () => {
      const result = buildDisplayOptions({ ...base, searchTerm: 'collapse' });
      const cmds = result.filter((o) => o.data?.menuItem?.kind === 'command');
      expect(cmds).toHaveLength(1);
      expect(cmds[0].label).toBe('Collapse all');
    });

    it('matches commands by description when label does not include the term', () => {
      const commands: EditorCommand[] = [
        ...mockCommands,
        {
          id: 'toggleEditorMode',
          label: 'Toggle graph editor',
          description: 'Switch between YAML and graph view',
          iconType: 'visGraph',
        },
      ];
      const result = buildDisplayOptions({ ...base, commands, searchTerm: 'yaml' });
      const cmds = result.filter((o) => o.data?.menuItem?.kind === 'command');
      expect(cmds).toHaveLength(1);
      expect(cmds[0].label).toBe('Toggle graph editor');
    });

    it('shows jump entries when search matches step names', () => {
      const result = buildDisplayOptions({ ...base, searchTerm: 'step' });
      const jumps = result.filter((o) => o.data?.menuItem?.kind === 'jump');
      expect(jumps).toHaveLength(3);
    });

    it('shows viewExisting nav when some but not all jump entries match', () => {
      const result = buildDisplayOptions({ ...base, searchTerm: 'alert' });
      const nav = result.find(
        (o) => o.data?.menuItem?.kind === 'nav' && o.data.menuItem.target === 'viewExisting'
      );
      expect(nav).toBeDefined();
    });

    it('does not show viewExisting when all jump entries match', () => {
      const result = buildDisplayOptions({ ...base, searchTerm: 'step' });
      const nav = result.find(
        (o) => o.data?.menuItem?.kind === 'nav' && o.data.menuItem.target === 'viewExisting'
      );
      expect(nav).toBeUndefined();
    });

    it('does not show jump section when no entries match', () => {
      const result = buildDisplayOptions({ ...base, searchTerm: 'zzz' });
      expect(groupLabels(result)).not.toContain('Jump to a step');
    });
  });
});
