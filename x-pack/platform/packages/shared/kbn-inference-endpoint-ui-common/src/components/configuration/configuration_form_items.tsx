/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { EuiFlexGroup } from '@elastic/eui';
import type { ConfigEntryView, ConfigValue } from '../../types/types';
import { ItemFormRow } from './item_form_row';

interface ConfigurationFormItemsProps {
  dataTestSubj?: string;
  descriptionLinks?: Record<string, React.ReactNode>;
  direction?: 'column' | 'row' | 'rowReverse' | 'columnReverse' | undefined;
  isEdit?: boolean;
  isLoading: boolean;
  isPreconfigured?: boolean;
  isInternalProvider?: boolean;
  items: ConfigEntryView[];
  setConfigEntry: (key: string, value: ConfigValue) => void;
}

export const ConfigurationFormItems: React.FC<ConfigurationFormItemsProps> = ({
  dataTestSubj,
  descriptionLinks,
  direction,
  isEdit,
  isPreconfigured,
  isInternalProvider,
  isLoading,
  items,
  setConfigEntry,
}) => {
  return (
    <EuiFlexGroup direction={direction} data-test-subj={dataTestSubj}>
      {items.map((configEntry) => {
        return (
          <ItemFormRow
            configEntry={configEntry}
            descriptionLinks={descriptionLinks}
            isPreconfigured={isPreconfigured}
            isInternalProvider={isInternalProvider}
            isEdit={isEdit}
            isLoading={isLoading}
            setConfigEntry={setConfigEntry}
          />
        );
      })}
    </EuiFlexGroup>
  );
};
