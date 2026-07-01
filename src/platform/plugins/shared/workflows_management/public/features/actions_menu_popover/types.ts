/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiSelectableOption, IconType } from '@elastic/eui';
import type { StabilityLevel } from '@kbn/workflows';

export interface EditorCommand {
  id: string;
  label: string;
  iconType: IconType;
  description?: string;
}

export interface JumpToStepEntry {
  id: string;
  label: string;
  lineStart: number;
}

export type MenuItemData =
  | { kind: 'action'; action: ActionOptionData }
  | { kind: 'command'; command: EditorCommand }
  | { kind: 'jump'; entry: JumpToStepEntry }
  | { kind: 'nav'; target: 'viewAll' | 'viewExisting' };

/**
 * Options passed to EuiSelectable carry MenuItemData inside the standard
 * `data` bag. EUI strips `data` from DOM props and spreads its contents
 * into the object handed to `renderOption`, so:
 *   - in renderOption:  (option as any).menuItem   ← spread from data
 *   - in onChange:       (option as any).data.menuItem  ← original objec
 * t
 * Use {@link getMenuItemData} to abstract over both contexts.
 */
export type MenuSelectableOption = EuiSelectableOption & {
  data?: { menuItem: MenuItemData };
};

export const getMenuItemData = (option: EuiSelectableOption): MenuItemData | undefined => {
  const o = option as unknown as Record<string, unknown>;
  return (
    (o.menuItem as MenuItemData | undefined) ??
    ((o.data as Record<string, unknown> | undefined)?.menuItem as MenuItemData | undefined)
  );
};

interface ActionBase {
  id: string;
  label: string;
  description?: string;
  instancesLabel?: string;
  iconColor?: string;
  stability?: StabilityLevel;
  /**
   * Ids from the root menu down through this row (for groups: path to open this group).
   * Set in `getActionOptions` for O(1) navigation when selecting from search.
   */
  pathIds?: readonly string[];
}

export interface ActionGroup extends ActionBase {
  iconType: IconType;
  options: ActionOptionData[];
  nestedGroups?: ActionGroup[];
}

export interface ActionConnectorGroup extends ActionBase {
  connectorType: string;
  options: ActionOptionData[];
}

export interface ActionOption extends ActionBase {
  id: string;
  iconType: IconType;
}

export interface ActionConnectorOption extends ActionBase {
  connectorType: string;
}

export type ActionOptionData =
  | ActionOption
  | ActionGroup
  | ActionConnectorGroup
  | ActionConnectorOption;

export function isActionGroup(option: ActionOptionData): option is ActionGroup {
  return 'options' in option;
}

export function isActionConnectorGroup(option: ActionOptionData): option is ActionConnectorGroup {
  return 'connectorType' in option && 'options' in option;
}

export function isActionConnectorOption(option: ActionOptionData): option is ActionConnectorOption {
  return 'connectorType' in option && !('options' in option);
}

export function isActionOption(option: ActionOptionData): option is ActionOption {
  return !('options' in option);
}
