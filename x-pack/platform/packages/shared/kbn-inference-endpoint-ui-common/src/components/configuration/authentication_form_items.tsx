/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import { EuiButtonGroup, EuiFlexGroup, EuiFlexItem, EuiTitle } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ConfigEntryView, ConfigValue } from '../../types/types';
import { ItemFormRow } from './item_form_row';

interface AuthenticationFormItemsProps {
  isEdit?: boolean;
  isLoading: boolean;
  isPreconfigured?: boolean;
  items: ConfigEntryView[];
  setConfigEntry: (key: string, value: ConfigValue) => void;
  reenterSecretsOnEdit?: boolean;
}

export const AuthenticationFormItems: React.FC<AuthenticationFormItemsProps> = ({
  isEdit,
  isPreconfigured,
  isLoading,
  items,
  setConfigEntry,
  reenterSecretsOnEdit,
}) => {
  const [authType, setAuthType] = useState<string>(items[0].key);
  const isMultiAuthType = useMemo(
    () => items.length > 1 && items.some((item) => item.required === false),
    [items]
  );
  const authTypeOptions = useMemo(
    () =>
      items.map((item) => ({
        id: item.key,
        label: item.label,
        value: item.key,
      })),
    [items]
  );
  const selectedConfigEntry = useMemo(
    () => items.find((item) => item.key === authType) || items[0],
    [authType, items]
  );

  return (
    <EuiFlexGroup direction="column" data-test-subj="authentication-fields">
      <EuiFlexItem grow={false}>
        <EuiTitle size="xxs" data-test-subj="authentication-label">
          <h4>
            <FormattedMessage
              id="xpack.inferenceEndpointUICommon.components.authenticationLabel"
              defaultMessage="Authentication"
            />
          </h4>
        </EuiTitle>
      </EuiFlexItem>
      {isMultiAuthType ? (
        <>
          <EuiFlexItem grow={false}>
            <EuiButtonGroup
              isDisabled={isLoading}
              data-test-subj="authTypeSelect"
              legend="Authentication type"
              defaultValue={authType}
              idSelected={authType}
              onChange={(id) => setAuthType(id)}
              options={authTypeOptions}
              color="text"
              type="single"
            />
          </EuiFlexItem>
          <ItemFormRow
            configEntry={selectedConfigEntry}
            isPreconfigured={isPreconfigured}
            isEdit={isEdit}
            isLoading={isLoading}
            setConfigEntry={setConfigEntry}
            reenterSecretsOnEdit={reenterSecretsOnEdit}
          />
        </>
      ) : null}
      {isMultiAuthType === false
        ? items.map((configEntry) => {
            return (
              <ItemFormRow
                configEntry={configEntry}
                isPreconfigured={isPreconfigured}
                isEdit={isEdit}
                isLoading={isLoading}
                setConfigEntry={setConfigEntry}
                reenterSecretsOnEdit={reenterSecretsOnEdit}
              />
            );
          })
        : null}
    </EuiFlexGroup>
  );
};
