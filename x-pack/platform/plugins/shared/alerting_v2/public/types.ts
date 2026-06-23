/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComponentType } from 'react';
import type { CreateRuleOptionsFlyoutProps } from './create_rule_options_flyout';

export type { CreateRuleOptionsFlyoutLegacyItem } from './create_rule_options_flyout';

export interface AlertingV2PublicStart {
  CreateRuleOptionsFlyout: ComponentType<CreateRuleOptionsFlyoutProps>;
}
