/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { lazy, Suspense } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getEcsField } from '../../../flyout/document_details/right/components/table_field_name_cell';
import {
  HOST_NAME_FIELD_NAME,
  IP_FIELD_TYPE,
  LEGACY_SIGNAL_RULE_NAME_FIELD_NAME,
  SIGNAL_RULE_NAME_FIELD_NAME,
} from '../../../timelines/components/timeline/body/renderers/constants';
import { FlowTargetSourceDest } from '../../../../common/search_strategy/security_solution/network';
import { FlyoutLoading } from '../components/flyout_loading';

const Host = lazy(() => import('../../entity/host/main').then((m) => ({ default: m.Host })));
const Network = lazy(() => import('../../network/main').then((m) => ({ default: m.Network })));
const RuleDetails = lazy(() => import('../../rule/main').then((m) => ({ default: m.RuleDetails })));

const SuspenseFallback = <FlyoutLoading />;

/**
 * Returns the React element to render inside the system flyout for the given field/value,
 * or null if the field type is not supported.
 *
 * Currently supports:
 * - IP fields → Network details flyout (value = IP address)
 * - Rule name field → Rule details flyout (value = rule ID)
 * - Host name → Host details flyout (pass hit for entity resolution)
 */
export const buildFlyoutContent = (
  field: string,
  value: string,
  hit?: DataTableRecord
): React.ReactElement | null => {
  const ecsField = getEcsField(field);

  if (ecsField?.type === IP_FIELD_TYPE) {
    const flowTarget = field.includes(FlowTargetSourceDest.destination)
      ? FlowTargetSourceDest.destination
      : FlowTargetSourceDest.source;

    return (
      <Suspense fallback={SuspenseFallback}>
        <Network ip={value} flowTarget={flowTarget} />
      </Suspense>
    );
  }

  if (field === SIGNAL_RULE_NAME_FIELD_NAME || field === LEGACY_SIGNAL_RULE_NAME_FIELD_NAME) {
    return (
      <Suspense fallback={SuspenseFallback}>
        <RuleDetails ruleId={value} />
      </Suspense>
    );
  }

  if (field === HOST_NAME_FIELD_NAME) {
    return (
      <Suspense fallback={SuspenseFallback}>
        <Host hostName={value} hit={hit} />
      </Suspense>
    );
  }

  return null;
};
