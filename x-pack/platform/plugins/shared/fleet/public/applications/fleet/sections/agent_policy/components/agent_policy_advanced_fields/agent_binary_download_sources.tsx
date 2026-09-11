/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { uniq } from 'lodash';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiSpacer,
  EuiSuperSelect,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import { DEFAULT_DOWNLOAD_SOURCE_REFERENCE } from '../../../../../../../common/constants';

import type { NewAgentPolicy, AgentPolicy } from '../../../../types';

import { DEFAULT_SELECT_VALUE } from './hooks';

const MAX_DOWNLOAD_SOURCES = 3;

interface Props {
  agentPolicy: Partial<NewAgentPolicy | AgentPolicy>;
  updateAgentPolicy: (u: Partial<NewAgentPolicy | AgentPolicy>) => void;
  downloadSourceOptions: Array<{
    value: string;
    inputDisplay: React.ReactNode;
    disabled?: boolean;
  }>;
  isLoading: boolean;
  disabled: boolean;
}

const getRows = (agentPolicy: Partial<NewAgentPolicy | AgentPolicy>): string[] => {
  if (agentPolicy.download_source_ids?.length) {
    // Duplicates are not reachable through the form, but a policy saved directly
    // through the API can hold them and rows are keyed by value.
    return uniq(
      agentPolicy.download_source_ids.map((id) =>
        id === DEFAULT_DOWNLOAD_SOURCE_REFERENCE ? DEFAULT_SELECT_VALUE : id
      )
    );
  }
  if (agentPolicy.download_source_id) {
    return [agentPolicy.download_source_id];
  }
  return [DEFAULT_SELECT_VALUE];
};

export const AgentBinaryDownloadSources: React.FunctionComponent<Props> = ({
  agentPolicy,
  updateAgentPolicy,
  downloadSourceOptions,
  isLoading,
  disabled,
}) => {
  // Every row maps to a stored entry, so the list stays derived from the policy
  // and follows it when the form is reset.
  const rows = getRows(agentPolicy);

  const commitRows = (updated: string[]) => {
    const ids = updated.map((row) =>
      row === DEFAULT_SELECT_VALUE ? DEFAULT_DOWNLOAD_SOURCE_REFERENCE : row
    );
    const [primary] = ids;
    updateAgentPolicy({
      download_source_id:
        !primary || primary === DEFAULT_DOWNLOAD_SOURCE_REFERENCE ? null : primary,
      download_source_ids: ids,
    });
  };

  const updateRow = (index: number, value: string) => {
    commitRows(rows.map((row, i) => (i === index ? value : row)));
  };

  const removeRow = (index: number) => {
    commitRows(rows.filter((_, i) => i !== index));
  };

  // A row is only ever added with a value no other row holds, since rows are
  // deduplicated and keyed by value.
  const nextAvailableValue = downloadSourceOptions.find(
    (option) => !option.disabled && !rows.includes(option.value)
  )?.value;

  const addRow = () => {
    if (nextAvailableValue) {
      commitRows([...rows, nextAvailableValue]);
    }
  };

  const atLimit = rows.length >= MAX_DOWNLOAD_SOURCES;

  const removeLabel = i18n.translate('xpack.fleet.agentPolicyForm.downloadSource.removeServer', {
    defaultMessage: 'Remove server',
  });

  return (
    <>
      <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>
              <FormattedMessage
                id="xpack.fleet.agentPolicyForm.downloadSource.priorityLabel"
                defaultMessage="Set server contact priority"
              />
            </strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiIconTip
            content={i18n.translate('xpack.fleet.agentPolicyForm.downloadSource.priorityTooltip', {
              defaultMessage:
                'Optionally choose the order in which servers are contacted in case of timeouts. Proxy, SSL and authentication settings are taken from the first server and apply to all of them. Agents running versions older than 9.6.0 will only use the first server.',
            })}
            position="right"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      <EuiFlexGroup direction="column" gutterSize="s">
        {rows.map((row, index) => (
          <EuiFlexItem key={row} grow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  {`${index + 1}.`}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiSuperSelect
                  aria-label={i18n.translate(
                    'xpack.fleet.agentPolicyForm.downloadSource.selectAriaLabel',
                    {
                      defaultMessage: 'Download source {position}',
                      values: { position: index + 1 },
                    }
                  )}
                  disabled={disabled}
                  fullWidth
                  isLoading={isLoading}
                  valueOfSelected={row}
                  onChange={(value) => updateRow(index, value)}
                  options={downloadSourceOptions.map((option) => ({
                    ...option,
                    disabled:
                      option.disabled || (option.value !== row && rows.includes(option.value)),
                  }))}
                  data-test-subj={`agentPolicyForm.downloadSource.select.${index}`}
                />
              </EuiFlexItem>
              {index > 0 && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={removeLabel} disableScreenReaderOutput>
                    <EuiButtonIcon
                      iconType="trash"
                      color="danger"
                      aria-label={removeLabel}
                      disabled={disabled}
                      onClick={() => removeRow(index)}
                      data-test-subj={`agentPolicyForm.downloadSource.remove.${index}`}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            iconType="plusCircle"
            size="s"
            flush="left"
            disabled={disabled || atLimit || !nextAvailableValue}
            onClick={addRow}
            data-test-subj="agentPolicyForm.downloadSource.addServer"
          >
            <FormattedMessage
              id="xpack.fleet.agentPolicyForm.downloadSource.addServer"
              defaultMessage="Add server"
            />
          </EuiButtonEmpty>
        </EuiFlexItem>
        {atLimit && (
          <EuiFlexItem grow={false}>
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="xpack.fleet.agentPolicyForm.downloadSource.limitReached"
                defaultMessage="You have reached the limit of selected servers."
              />
            </EuiText>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </>
  );
};
