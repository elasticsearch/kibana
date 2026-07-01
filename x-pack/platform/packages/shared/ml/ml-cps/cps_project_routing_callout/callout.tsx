/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useEffect, useState } from 'react';

import { EuiButton, EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { HttpStart } from '@kbn/core-http-browser';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import { UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER } from '@kbn/ui-actions-plugin/common/trigger_ids';

const BULK_UPDATE_PROJECT_ROUTING_PATH = '/internal/ml/jobs/bulk_update_project_routing' as const;

const DEFAULT_ML_PROJECT_ROUTING = '_alias:_origin';

export interface CpsProjectRoutingCalloutProps {
  http: HttpStart;
  uiActions: UiActionsStart;
  options?: {
    filterJobGroups?: string[];
  };
  /** Called when the update project routing flyout is closed (optional context on the trigger). */
  onUpdateFlyoutClose?: () => void;
}

/**
 * @internal
 * Matches the ML plugin response for {@code bulk_update_project_routing}.
 */
export interface BulkUpdateProjectRoutingResult {
  simulate: boolean;
  results: Record<
    string,
    { success: boolean; datafeedId: string; simulated?: boolean; error?: unknown }
  >;
}

export const CpsProjectRoutingCallout: FC<CpsProjectRoutingCalloutProps> = ({
  http,
  uiActions,
  options,
  onUpdateFlyoutClose,
}) => {
  const [jobIds, setJobIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void http
      .post<BulkUpdateProjectRoutingResult>(BULK_UPDATE_PROJECT_ROUTING_PATH, {
        body: JSON.stringify({
          projectRouting: DEFAULT_ML_PROJECT_ROUTING,
          simulate: true,
          auto: true,
          jobGroups: options?.filterJobGroups,
        }),
        version: '1',
        asSystemRequest: true,
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setJobIds(Object.keys(response.results));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [http, options]);

  const onUpdateProjectRouting = useCallback(() => {
    void uiActions.executeTriggerActions(UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER, {
      initialJobIds: jobIds,
      allowScopeSelection: false,
      onClose: onUpdateFlyoutClose,
    });
  }, [uiActions, onUpdateFlyoutClose, jobIds]);

  if (jobIds.length === 0) {
    return null;
  }

  return (
    <>
      <EuiCallOut
        title={i18n.translate('xpack.ml.cpsProjectRoutingCallout.title', {
          defaultMessage: 'Update project routing for legacy jobs',
        })}
        color="primary"
        data-test-subj="mlCpsProjectRoutingCallout"
      >
        <EuiText size="s" data-test-subj="mlCpsProjectRoutingCalloutJobCount">
          <FormattedMessage
            id="xpack.ml.cpsProjectRoutingCallout.jobCount"
            defaultMessage="Some jobs are not using project routing. Update their project routing to use cross-project search."
          />
        </EuiText>
        <EuiSpacer size="m" />
        <EuiButton
          data-test-subj="mlCpsProjectRoutingCalloutUpdate"
          onClick={onUpdateProjectRouting}
          color="primary"
          size="s"
        >
          {i18n.translate('xpack.ml.cpsProjectRoutingCallout.updateButton', {
            defaultMessage:
              'Update project routing for {count, plural, one {# job} other {# jobs}}',
            values: { count: jobIds.length },
          })}
        </EuiButton>
      </EuiCallOut>

      <EuiSpacer size="m" />
    </>
  );
};
