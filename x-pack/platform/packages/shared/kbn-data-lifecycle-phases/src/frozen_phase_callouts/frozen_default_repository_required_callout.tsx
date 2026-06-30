/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiCallOut, EuiSpacer, EuiSplitButton, EuiText } from '@elastic/eui';

export interface FrozenDefaultRepositoryRequiredCalloutProps {
  onCreateDefaultRepository?: () => void;
  createDefaultRepositoryHref?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  calloutTestSubj?: string;
  createButtonTestSubj?: string;
  refreshButtonTestSubj?: string;
}

export const FrozenDefaultRepositoryRequiredCallout = ({
  onCreateDefaultRepository,
  createDefaultRepositoryHref,
  onRefresh,
  isRefreshing,
  calloutTestSubj,
  createButtonTestSubj,
  refreshButtonTestSubj,
}: FrozenDefaultRepositoryRequiredCalloutProps) => {
  return (
    <EuiCallOut
      size="s"
      color="warning"
      announceOnMount={false}
      title={i18n.translate(
        'xpack.dataLifecyclePhases.frozen.defaultRepositoryRequiredCallout.title',
        {
          defaultMessage: 'Default snapshot repository required',
        }
      )}
      data-test-subj={calloutTestSubj}
    >
      <EuiText size="s" color="subdued">
        {i18n.translate('xpack.dataLifecyclePhases.frozen.defaultRepositoryRequiredCallout.body', {
          defaultMessage:
            'The previously assigned default searchable snapshot repository is no longer available. This phase will be ignored until you assign a new default repository, then refresh this panel.',
        })}
      </EuiText>

      {(onCreateDefaultRepository || createDefaultRepositoryHref || onRefresh) && (
        <>
          <EuiSpacer size="m" />
          <EuiSplitButton size="s" color="warning">
            <EuiSplitButton.ActionPrimary
              data-test-subj={createButtonTestSubj}
              isDisabled={!onCreateDefaultRepository && !createDefaultRepositoryHref}
              href={createDefaultRepositoryHref}
              target={createDefaultRepositoryHref ? '_blank' : undefined}
              onClick={createDefaultRepositoryHref ? undefined : onCreateDefaultRepository}
            >
              {i18n.translate(
                'xpack.dataLifecyclePhases.frozen.defaultRepositoryRequiredCallout.createButton',
                { defaultMessage: 'Create default repository' }
              )}
            </EuiSplitButton.ActionPrimary>
            <EuiSplitButton.ActionSecondary
              iconType="refresh"
              isLoading={Boolean(isRefreshing)}
              disabled={Boolean(isRefreshing) || !onRefresh}
              aria-label={i18n.translate(
                'xpack.dataLifecyclePhases.frozen.defaultRepositoryRequiredCallout.refreshButtonAriaLabel',
                { defaultMessage: 'Refresh panel' }
              )}
              data-test-subj={refreshButtonTestSubj}
              onClick={onRefresh}
            />
          </EuiSplitButton>
        </>
      )}
    </EuiCallOut>
  );
};
