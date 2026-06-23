/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiIconTip,
  EuiText,
  EuiTextColor,
  EuiTitle,
} from '@elastic/eui';
import { isArray } from 'lodash/fp';
import React from 'react';
import type { GroupPanelRenderer } from '@kbn/grouping/src';
import type { AlertsGroupingAggregation } from './types';
import { firstNonNullValue } from '../../../../../common/endpoint/models/ecs_safety_helpers';
import type { GenericBuckets } from '../../../../../common/search_strategy';
import { PopoverItems } from '../../../../common/components/popover_items';
import { COLUMN_TAGS } from '../../../../detection_engine/common/translations';

/**
 * Returns renderers to be used in the `buttonContent` property of the EuiAccordion component used within the kbn-grouping package.
 * It handles custom renders for the following fields:
 * - kibana.alert.rule.name
 * - host.name
 * - user.name
 * - source.ip
 * For all the other fields the default renderer managed within the kbn-grouping package will be used.
 *
 * This go hand in hand with defaultGroupingOptions and defaultGroupStatsRenderer and defaultGroupStatsAggregations.
 */
export const defaultGroupTitleRenderers: GroupPanelRenderer<AlertsGroupingAggregation> = (
  selectedGroup,
  bucket,
  nullGroupMessage
) => {
  switch (selectedGroup) {
    case 'kibana.alert.rule.name':
      return isArray(bucket.key) ? (
        <RuleNameGroupContent
          ruleName={bucket.key[0]}
          ruleDescription={
            firstNonNullValue(firstNonNullValue(bucket.description?.buckets)?.key) ?? ''
          }
          tags={bucket.ruleTags?.buckets}
        />
      ) : undefined;
    case 'host.name':
      return (
        <GroupWithIconContent
          title={bucket.key}
          icon="storage"
          nullGroupMessage={nullGroupMessage}
          dataTestSubj="host-name"
        />
      );
    case 'user.name':
      return (
        <GroupWithIconContent
          title={bucket.key}
          icon="user"
          nullGroupMessage={nullGroupMessage}
          dataTestSubj="user-name"
        />
      );
    case 'source.ip':
      return (
        <GroupWithIconContent
          title={bucket.key}
          icon="globe"
          nullGroupMessage={nullGroupMessage}
          dataTestSubj="source-ip"
        />
      );
  }
};

export const RULE_NAME_GROUP_TEST_ID = 'rule-name-group-renderer';
export const RULE_NAME_GROUP_TITLE_TEST_ID = 'rule-name-group-renderer-title';
export const RULE_NAME_GROUP_DESCRIPTION_TEST_ID = 'rule-name-group-renderer-description';
export const RULE_NAME_GROUP_TAG_TEST_ID = 'rule-name-group-renderer-tag';
export const RULE_NAME_GROUP_TAGS_TEST_ID = 'rule-name-group-renderer-tags';

export const RuleNameGroupContent = React.memo<{
  ruleName: string;
  ruleDescription: string;
  tags?: GenericBuckets[] | undefined;
}>(({ ruleName, ruleDescription, tags }) => {
  const renderItem = (tag: string, i: number) => (
    <EuiBadge color="hollow" key={`${tag}-${i}`} data-test-subj={RULE_NAME_GROUP_TAG_TEST_ID}>
      {tag}
    </EuiBadge>
  );
  return (
    <div css={{ display: 'table', tableLayout: 'fixed', width: '100%' }}>
      <EuiFlexGroup data-test-subj={RULE_NAME_GROUP_TEST_ID} gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false} css={{ display: 'contents' }}>
          <EuiTitle data-test-subj={RULE_NAME_GROUP_TITLE_TEST_ID} size="xs">
            <h5 className="eui-textTruncate">{ruleName.trim()}</h5>
          </EuiTitle>
        </EuiFlexItem>
        {tags && tags.length > 0 ? (
          <EuiFlexItem grow={false}>
            <PopoverItems
              items={tags.map((tag) => tag.key.toString())}
              popoverTitle={COLUMN_TAGS}
              popoverButtonTitle={tags.length.toString()}
              popoverButtonIcon="tag"
              dataTestPrefix={RULE_NAME_GROUP_TAGS_TEST_ID}
              renderItem={renderItem}
            />
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
      <EuiText data-test-subj={RULE_NAME_GROUP_DESCRIPTION_TEST_ID} size="s">
        <p className="eui-textTruncate">
          <EuiTextColor color="subdued">{ruleDescription}</EuiTextColor>
        </p>
      </EuiText>
    </div>
  );
});
RuleNameGroupContent.displayName = 'RuleNameGroup';

export const GroupWithIconContent = React.memo<{
  title: string | string[];
  icon: string;
  nullGroupMessage?: string;
  dataTestSubj?: string;
}>(({ title, icon, nullGroupMessage, dataTestSubj }) => (
  <EuiFlexGroup
    data-test-subj={`${dataTestSubj}-group-renderer`}
    gutterSize="s"
    alignItems="center"
  >
    <EuiFlexItem grow={false}>
      <EuiIcon
        data-test-subj={`${dataTestSubj}-group-renderer-icon`}
        size="m"
        type={icon}
        aria-hidden={true}
      />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiTitle data-test-subj={`${dataTestSubj}-group-renderer-title`} size="xs">
        <h5>{title}</h5>
      </EuiTitle>
    </EuiFlexItem>
    {nullGroupMessage && (
      <EuiFlexItem data-test-subj={`${dataTestSubj}-group-renderer-null-message`} grow={false}>
        <EuiIconTip content={nullGroupMessage} position="right" />
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
));
GroupWithIconContent.displayName = 'GroupWithIconContent';
