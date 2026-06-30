/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type {
  ActionOptionData,
  EditorCommand,
  JumpToStepEntry,
  MenuSelectableOption,
} from '../types';

export const STEPS_PREFIX = 'Steps: ';
export const MAX_VISIBLE_STEPS = 7;

interface UseDisplayOptionsArgs {
  options: ActionOptionData[];
  searchTerm: string;
  commands?: EditorCommand[];
  jumpToStepEntries?: JumpToStepEntry[];
  currentPath: string[];
}

export function useDisplayOptions({
  options,
  searchTerm,
  commands,
  jumpToStepEntries,
  currentPath,
}: UseDisplayOptionsArgs): MenuSelectableOption[] {
  return useMemo(
    () =>
      buildDisplayOptions({
        options,
        searchTerm,
        commands,
        jumpToStepEntries,
        currentPath,
      }),
    [options, searchTerm, commands, jumpToStepEntries, currentPath]
  );
}

export function buildDisplayOptions({
  options,
  searchTerm,
  commands,
  jumpToStepEntries,
  currentPath,
}: UseDisplayOptionsArgs): MenuSelectableOption[] {
  const result: MenuSelectableOption[] = [];
  const term = searchTerm.trim().toLowerCase();
  const isStepsMode = searchTerm.startsWith(STEPS_PREFIX);
  const isHashMode = !isStepsMode && searchTerm.trimStart().startsWith('#');
  const hasSearch = term.length > 0;

  if (currentPath.length > 0) {
    for (const opt of options) {
      result.push({ label: opt.label, data: { menuItem: { kind: 'action', action: opt } } });
    }
    return result;
  }

  if (isHashMode) {
    const jumpTerm = term.slice(1).trim();
    const filteredJumps = (jumpToStepEntries ?? []).filter(
      (entry) => !jumpTerm || entry.id.toLowerCase().includes(jumpTerm)
    );
    if (filteredJumps.length > 0) {
      result.push({
        label: i18n.translate('workflows.actionsMenu.jumpToStepGroupLabel', {
          defaultMessage: 'Jump to a step',
        }),
        isGroupLabel: true,
      });
      for (const entry of filteredJumps) {
        result.push({
          label: entry.label,
          className: 'compactOption',
          data: { menuItem: { kind: 'jump', entry } },
        });
      }
    }
    return result;
  }

  if (isStepsMode) {
    if (options.length > 0) {
      result.push({
        label: i18n.translate('workflows.actionsMenu.addStepGroupLabel', {
          defaultMessage: 'Add step',
        }),
        isGroupLabel: true,
      });
      for (const opt of options) {
        result.push({ label: opt.label, data: { menuItem: { kind: 'action', action: opt } } });
      }
    }
    return result;
  }

  const visibleOptions = hasSearch ? options.slice(0, MAX_VISIBLE_STEPS) : options;
  if (visibleOptions.length > 0) {
    result.push({
      label: i18n.translate('workflows.actionsMenu.addStepGroupLabel', {
        defaultMessage: 'Add step',
      }),
      isGroupLabel: true,
    });
    for (const opt of visibleOptions) {
      result.push({ label: opt.label, data: { menuItem: { kind: 'action', action: opt } } });
    }

    if (hasSearch && options.length > MAX_VISIBLE_STEPS) {
      result.push({
        label: i18n.translate('workflows.actionsMenu.viewAllSteps', {
          defaultMessage: 'View all steps to add',
        }),
        className: 'compactOption',
        data: { menuItem: { kind: 'nav', target: 'viewAll' } },
      });
    }
  }

  const filteredCmds = (commands ?? []).filter((cmd) => {
    if (!term) {
      return true;
    }
    const label = cmd.label.toLowerCase();
    const description = cmd.description?.toLowerCase() ?? '';
    return label.includes(term) || description.includes(term);
  });
  if (filteredCmds.length > 0) {
    result.push({
      label: i18n.translate('workflows.actionsMenu.commandsGroupLabel', {
        defaultMessage: 'Commands',
      }),
      isGroupLabel: true,
    });
    for (const cmd of filteredCmds) {
      result.push({
        label: cmd.label,
        className: 'compactOption',
        data: { menuItem: { kind: 'command', command: cmd } },
      });
    }
  }

  if (hasSearch) {
    const filteredJumps = (jumpToStepEntries ?? []).filter(
      (entry) => entry.id.toLowerCase().includes(term) || entry.label.toLowerCase().includes(term)
    );
    if (filteredJumps.length > 0) {
      result.push({
        label: i18n.translate('workflows.actionsMenu.jumpToStepGroupLabel', {
          defaultMessage: 'Jump to a step',
        }),
        isGroupLabel: true,
      });
      for (const entry of filteredJumps) {
        result.push({
          label: entry.label,
          className: 'compactOption',
          data: { menuItem: { kind: 'jump', entry } },
        });
      }
      if ((jumpToStepEntries ?? []).length > filteredJumps.length) {
        result.push({
          label: i18n.translate('workflows.actionsMenu.viewAllExistingSteps', {
            defaultMessage: 'View all existing steps',
          }),
          className: 'compactOption',
          data: { menuItem: { kind: 'nav', target: 'viewExisting' } },
        });
      }
    }
  }

  return result;
}
