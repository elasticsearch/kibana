/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AppHeader } from '@kbn/app-header';
import React from 'react';
import { buildSlo } from '../../../data/slo/slo';
import { ActionModalProvider } from '../../../context/action_modal';
import { KibanaReactStorybookDecorator } from '../../../utils/kibana_react.storybook_decorator';
import type { Props } from './header_control';
import { useSloDetailsActionsPrimary } from './header_control';

function HeaderControlHarness({ slo }: Props) {
  const { primaryActionItem, flyouts } = useSloDetailsActionsPrimary({ slo });
  return (
    <ActionModalProvider>
      <AppHeader title={slo.name} menu={{ primaryActionItem }} />
      {flyouts}
    </ActionModalProvider>
  );
}

export default {
  component: HeaderControlHarness,
  title: 'app/SLO/DetailsPage/HeaderControl',
  decorators: [KibanaReactStorybookDecorator],
};

const defaultProps: Props = {
  slo: buildSlo(),
};

export const Default = {
  args: defaultProps,
};
