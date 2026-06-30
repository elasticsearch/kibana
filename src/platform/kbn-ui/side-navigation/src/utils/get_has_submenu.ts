/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MenuItem } from '../../types';
import { sectionHasContent } from './section_has_content';

/**
 * Utility function for checking whether the menu item has a submenu.
 *
 * @param item - the menu item to check.
 * @returns `true` if the menu item has a submenu, `false` otherwise.
 */
export const getHasSubmenu = (item: MenuItem): boolean => {
  return !!item.sections?.some(sectionHasContent);
};
