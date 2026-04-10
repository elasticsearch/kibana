/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { CleanupItem, SnippetVariableKey } from '../../../hooks/use_tutorial_content';
import { useCleanupState } from '../../../hooks/use_cleanup_state';
import { insertValues } from '../../../hooks/use_execute_tutorial_step';

export interface CleanupStepCardProps {
  cleanup: CleanupItem[];
  savedValues: Record<SnippetVariableKey, string>;
  onComplete: () => void;
}

export const CleanupStepCard: React.FC<CleanupStepCardProps> = ({
  cleanup,
  savedValues,
  onComplete,
}) => {
  const { itemStates, executeDelete } = useCleanupState(cleanup, savedValues);

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="tutorialCleanupStep">
      <EuiTitle size="xs">
        <h3>
          {i18n.translate('xpack.searchGettingStarted.tutorial.cleanup.title', {
            defaultMessage: 'Cleanup (optional)',
          })}
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText size="s">
        <p>
          {i18n.translate('xpack.searchGettingStarted.tutorial.cleanup.description', {
            defaultMessage:
              'Delete the resources created during this tutorial. This step is optional — you can complete the tutorial without cleaning up.',
          })}
        </p>
      </EuiText>
      <EuiSpacer size="m" />

      <ul>
        {cleanup.map((item, i) => {
          const resolvedLabel = insertValues(item.label, savedValues);
          const itemState = itemStates[i];

          return (
            <li key={i}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow>
                  <EuiText size="s">{resolvedLabel}</EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      {itemState.status === 'deleted' ? (
                        <EuiButton
                          color="danger"
                          iconType="trash"
                          size="s"
                          isDisabled
                          data-test-subj={`cleanupItem-${i}-deleted`}
                        >
                          {i18n.translate('xpack.searchGettingStarted.tutorial.cleanup.deleted', {
                            defaultMessage: 'Deleted',
                          })}
                        </EuiButton>
                      ) : (
                        <EuiButton
                          color="danger"
                          iconType="trash"
                          size="s"
                          isLoading={itemState.status === 'loading'}
                          onClick={() => executeDelete(i)}
                          data-test-subj={`cleanupItem-${i}-delete`}
                        >
                          {i18n.translate('xpack.searchGettingStarted.tutorial.cleanup.delete', {
                            defaultMessage: 'Delete',
                          })}
                        </EuiButton>
                      )}
                    </EuiFlexItem>
                    {itemState.status === 'error' && itemState.error && (
                      <EuiFlexItem grow={false}>
                        <EuiIconTip type="warning" color="warning" content={itemState.error} />
                      </EuiFlexItem>
                    )}
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
              {i < cleanup.length - 1 && <EuiSpacer size="s" />}
            </li>
          );
        })}
      </ul>

      <EuiSpacer size="l" />
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            iconType="check"
            onClick={onComplete}
            data-test-subj="tutorialCleanupComplete"
          >
            {i18n.translate('xpack.searchGettingStarted.tutorial.cleanup.complete', {
              defaultMessage: 'Complete tutorial',
            })}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
