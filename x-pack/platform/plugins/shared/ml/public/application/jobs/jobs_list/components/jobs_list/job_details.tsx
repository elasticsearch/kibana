/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';

import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiIconTip, EuiText, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { MlSummaryJob } from '@kbn/ml-common-types/anomaly_detection_jobs/summary_job';
import type { AuditMessageBase } from '@kbn/ml-common-types/audit_message';

import { JobIcon } from '../../../../components/job_message_icon';
import { isManagedJob } from '../../../jobs_utils';
import { JobGroup } from '../job_group';

type MlSummaryJobWithSpaces = MlSummaryJob & {
  spaces?: string[];
};

interface Props {
  id: string;
  job: MlSummaryJobWithSpaces;
}

export const JobDetails: FC<Props> = ({ id, job }) => {
  const showManaged = isManagedJob(job);
  const showAlertIcon = Array.isArray(job.alertingRules) && job.alertingRules.length > 0;
  const showAuditIcon = Boolean(job.auditMessage);

  return (
    <EuiFlexGroup gutterSize="xs" direction="column">
      <EuiFlexGroup gutterSize="s" alignItems="center" wrap>
        <EuiFlexItem grow={false}>
          <strong data-test-subj="mlModelsTableColumnIdValueId">{id}</strong>
        </EuiFlexItem>
        {showManaged ? (
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={i18n.translate('xpack.ml.jobsList.managedBadgeTooltip', {
                defaultMessage:
                  'This job is preconfigured and managed by Elastic; other parts of the product might have might have dependencies on its behavior.',
              })}
            >
              <EuiBadge tabIndex={0} color="hollow" data-test-subj="mlJobListRowManagedLabel">
                {i18n.translate('xpack.ml.jobsList.managedBadgeLabel', {
                  defaultMessage: 'Managed',
                })}
              </EuiBadge>
            </EuiToolTip>
          </EuiFlexItem>
        ) : null}
        {showAlertIcon ? (
          <EuiFlexItem grow={false}>
            <EuiIconTip
              position="bottom"
              content={
                <FormattedMessage
                  id="xpack.ml.jobsList.alertingRules.tooltipContent"
                  defaultMessage="Job has {rulesCount} associated alert {rulesCount, plural, one {rule} other {rules}}"
                  values={{ rulesCount: job.alertingRules?.length }}
                />
              }
              type="bell"
              data-test-subj="mlJobListAlertRulesIcon"
            />
          </EuiFlexItem>
        ) : null}
        {showAuditIcon ? (
          <EuiFlexItem grow={false}>
            <JobIcon message={job.auditMessage as AuditMessageBase} showTooltip={true} />
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>

      <EuiText color="subdued" size="xs" data-test-subj="mlJobListRowDescription">
        {job.description}
      </EuiText>

      {Array.isArray(job.groups) && job.groups.length > 0 ? (
        <EuiFlexGroup
          gutterSize="xs"
          direction="row"
          wrap
          responsive={false}
          data-test-subj="mlJobListRowGroups"
        >
          {job.groups.map((group) => (
            <EuiFlexItem key={group} grow={false}>
              <JobGroup name={group} />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      ) : null}
    </EuiFlexGroup>
  );
};
