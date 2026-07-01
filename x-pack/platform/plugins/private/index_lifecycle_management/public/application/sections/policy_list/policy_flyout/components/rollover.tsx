/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { SerializedHotPhase } from '../../../../../../common/types';
import { i18nTexts } from '../../../edit_policy/i18n_texts';
import { ActionDescription } from './action_description';
import type { ActionComponentProps } from './types';

export const Rollover = ({ phase, phases }: ActionComponentProps) => {
  const phaseConfig = phases[phase];
  const rollover = (phaseConfig as SerializedHotPhase)?.actions.rollover;
  const descriptionItems = [];
  if (rollover?.max_primary_shard_size) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.maxPrimaryShardSizeLabel}: `}
        <strong>{rollover.max_primary_shard_size}</strong>
      </>
    );
  }
  if (rollover?.max_primary_shard_docs) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.maxPrimaryShardDocsLabel}: `}
        <strong>{rollover.max_primary_shard_docs}</strong>
      </>
    );
  }

  if (rollover?.max_age) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.maxAgeLabel}: `}
        <strong>{rollover.max_age}</strong>
      </>
    );
  }

  if (rollover?.max_docs) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.maxDocsLabel}: `}
        <strong>{rollover.max_docs}</strong>
      </>
    );
  }

  if (rollover?.max_size) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.maxSizeLabel}: `}
        <strong>{rollover.max_size}</strong>{' '}
        <EuiBadge color="warning">
          <FormattedMessage
            id="xpack.indexLifecycleMgmt.policyFlyout.deprecatedLabel"
            defaultMessage="Deprecated"
          />
        </EuiBadge>
      </>
    );
  }

  if (rollover?.min_primary_shard_size) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.minPrimaryShardSizeLabel}: `}
        <strong>{rollover.min_primary_shard_size}</strong>
      </>
    );
  }

  if (rollover?.min_primary_shard_docs) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.minPrimaryShardDocsLabel}: `}
        <strong>{rollover.min_primary_shard_docs}</strong>
      </>
    );
  }

  if (rollover?.min_age) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.minRolloverAgeLabel}: `}
        <strong>{rollover.min_age}</strong>
      </>
    );
  }

  if (rollover?.min_docs !== undefined) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.minDocsLabel}: `}
        <strong>{rollover.min_docs}</strong>
      </>
    );
  }

  if (rollover?.min_size) {
    descriptionItems.push(
      <>
        {`${i18nTexts.editPolicy.minSizeLabel}: `}
        <strong>{rollover.min_size}</strong>
      </>
    );
  }

  return rollover ? (
    <ActionDescription
      title={i18nTexts.editPolicy.rolloverLabel}
      descriptionItems={descriptionItems}
    />
  ) : null;
};
