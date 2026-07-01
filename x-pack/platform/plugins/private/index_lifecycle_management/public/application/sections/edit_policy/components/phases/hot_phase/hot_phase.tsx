/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { EuiSpacer, EuiCallOut, EuiTextColor, EuiSwitch, EuiText } from '@elastic/eui';

import { useKibana } from '../../../../../../shared_imports';

import { i18nTexts } from '../../../i18n_texts';

import { useConfiguration, UseField } from '../../../form';

import { useEditPolicyContext } from '../../../edit_policy_context';

import { LearnMoreLink, DescribedFormRow } from '../..';

import {
  ForcemergeField,
  IndexPriorityField,
  SearchableSnapshotField,
  ReadonlyField,
  ShrinkField,
  DownsampleField,
} from '../shared_fields';
import { Phase } from '../phase';

import { useRolloverValueRequiredValidation } from './use_rollover_value_required_validation';
import { RolloverFields } from './components';

export const HotPhase: FunctionComponent = () => {
  const { license } = useEditPolicyContext();
  const { isUsingRollover, isUsingDownsampleInHotPhase } = useConfiguration();

  const showEmptyRolloverFieldsError = useRolloverValueRequiredValidation();

  const { docLinks } = useKibana().services;

  return (
    <Phase phase="hot">
      <DescribedFormRow
        title={<h3>{i18nTexts.editPolicy.rolloverLabel}</h3>}
        description={
          <>
            <EuiTextColor color="subdued">
              <p>
                <FormattedMessage
                  id="xpack.indexLifecycleMgmt.editPolicy.hotPhase.rolloverDescriptionMessage"
                  defaultMessage="Start writing to a new index when the current index reaches a certain size, document count, or age. Enables you to optimize performance and manage resource usage when working with time series data."
                />
              </p>
            </EuiTextColor>
            <EuiSpacer />
            <EuiTextColor color="subdued">
              <p>
                <strong>
                  {i18n.translate(
                    'xpack.indexLifecycleMgmt.rollover.rolloverOffsetsPhaseTimingDescriptionNote',
                    { defaultMessage: 'Note: ' }
                  )}
                </strong>
                {i18nTexts.editPolicy.rolloverOffsetsHotPhaseTiming}{' '}
                <LearnMoreLink
                  text={
                    <FormattedMessage
                      id="xpack.indexLifecycleMgmt.editPolicy.hotPhase.learnAboutRolloverLinkText"
                      defaultMessage="Learn more"
                    />
                  }
                  docPath={docLinks.links.elasticsearch.ilmRollover}
                />
              </p>
            </EuiTextColor>
            <EuiSpacer />
            <UseField<boolean> path="_meta.hot.customRollover.enabled">
              {(field) => (
                <EuiText color="default">
                  <EuiSwitch
                    label={field.label}
                    checked={field.value}
                    onChange={(e) => field.setValue(e.target.checked)}
                    data-test-subj="rolloverSwitch"
                  />
                </EuiText>
              )}
            </UseField>
          </>
        }
        fullWidth
      >
        {isUsingRollover ? (
          <div aria-live="polite" role="region">
            {showEmptyRolloverFieldsError && (
              <>
                <EuiCallOut
                  announceOnMount={false}
                  size="s"
                  title={i18nTexts.editPolicy.errors.rollOverConfigurationCallout.title}
                  data-test-subj="rolloverSettingsRequired"
                  color="danger"
                >
                  <div>{i18nTexts.editPolicy.errors.rollOverConfigurationCallout.body}</div>
                </EuiCallOut>
                <EuiSpacer size="s" />
              </>
            )}
            <RolloverFields />
          </div>
        ) : (
          <div />
        )}
      </DescribedFormRow>
      {isUsingRollover && (
        <>
          {<ForcemergeField phase={'hot'} />}
          <ShrinkField phase={'hot'} />
          {license.canUseSearchableSnapshot() && <SearchableSnapshotField phase="hot" />}
          <DownsampleField phase="hot" />
          {!isUsingDownsampleInHotPhase && <ReadonlyField phase={'hot'} />}
        </>
      )}
      <IndexPriorityField phase={'hot'} />
    </Phase>
  );
};
