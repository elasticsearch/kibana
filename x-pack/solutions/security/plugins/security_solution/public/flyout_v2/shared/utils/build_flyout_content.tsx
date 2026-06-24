/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getEcsField } from '../../../flyout/document_details/right/components/table_field_name_cell';
import {
  IP_FIELD_TYPE,
  LEGACY_SIGNAL_RULE_NAME_FIELD_NAME,
  SIGNAL_RULE_NAME_FIELD_NAME,
} from '../../../timelines/components/timeline/body/renderers/constants';
import { FlowTargetSourceDest } from '../../../../common/search_strategy/security_solution/network';
import { Network } from '../../network/main';
import { RuleDetails } from '../../rule/main';

/**
 * Returns the React element to render inside the system flyout for the given field/value,
 * or null if the field type is not supported.
 *
 * Currently supports:
 * - IP fields → Network details flyout (value = IP address)
 * - Rule name field → Rule details flyout (value = rule ID)
 *
 * @param hit - Optional hit record for entity resolution (used by Host flyout, wired up in a later PR)
 */
export const buildFlyoutContent = (
  field: string,
  value: string,
  _hit?: DataTableRecord
): React.ReactElement | null => {
  const ecsField = getEcsField(field);

  if (ecsField?.type === IP_FIELD_TYPE) {
    const flowTarget = field.includes(FlowTargetSourceDest.destination)
      ? FlowTargetSourceDest.destination
      : FlowTargetSourceDest.source;

    return <Network ip={value} flowTarget={flowTarget} />;
  }

  if (field === SIGNAL_RULE_NAME_FIELD_NAME || field === LEGACY_SIGNAL_RULE_NAME_FIELD_NAME) {
    return <RuleDetails ruleId={value} />;
  }

  return null;
};
