/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { Navigation, type NavigationProps } from './src/components/navigation';
export { SecondaryMenu } from './src/components/secondary_menu';
export { useNavigation } from './src/hooks/use_navigation';
export { COLLAPSED_WIDTH, EXPANDED_WIDTH } from './src/hooks/use_layout_width';
export type {
  BadgeType,
  MenuItem,
  NavigationStructure,
  SecondaryMenuItem,
  SecondaryMenuSection,
  SideNavLogo,
  NavExtensionRenderContext,
} from './types';
