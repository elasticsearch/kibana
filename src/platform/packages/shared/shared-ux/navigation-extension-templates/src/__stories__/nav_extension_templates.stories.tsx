/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Meta, StoryObj } from '@storybook/react';
import { TEMPLATES } from '../templates';
import { ListTemplateUsage as ListTemplateSimpleUsageScene } from './scenes/list_template_simple_usage';
import { ListTemplateRobustUsage as ListTemplateRobustUsageScene } from './scenes/list_template_robust_usage';
import mdx from './guide.mdx';

export default {
  title: 'Navigation Extension Templates',
  subcomponents: TEMPLATES,
  parameters: {
    docs: {
      page: mdx,
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

/**
 * @description story for list template simple usage
 */
export const ListTemplateSimpleUsage: StoryObj<typeof ListTemplateSimpleUsageScene> = {
  ...ListTemplateSimpleUsageScene,
  name: 'List Template Simple Usage',
};

/**
 * @description story for list template robust usage
 */
export const ListTemplateRobustUsage: StoryObj<typeof ListTemplateRobustUsageScene> = {
  ...ListTemplateRobustUsageScene,
  name: 'List Template Robust Usage',
};
