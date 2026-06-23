/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiIcon } from '@elastic/eui';
import React, { memo } from 'react';
import type { GroupStatsItem, RawBucket } from '@kbn/grouping';
import type { GenericBuckets } from '@kbn/grouping/src';
import { DEFAULT_GROUP_STATS_RENDERER } from '../alerts_grouping';
import type { AlertsGroupingAggregation } from './types';
import * as i18n from '../translations';

export const getUsersBadge = (bucket: RawBucket<AlertsGroupingAggregation>): GroupStatsItem => ({
  title: i18n.STATS_GROUP_USERS,
  badge: {
    value: bucket.usersCountAggregation?.value ?? 0,
  },
});
export const getHostsBadge = (bucket: RawBucket<AlertsGroupingAggregation>): GroupStatsItem => ({
  title: i18n.STATS_GROUP_HOSTS,
  badge: {
    value: bucket.hostsCountAggregation?.value ?? 0,
  },
});
export const getRulesBadge = (bucket: RawBucket<AlertsGroupingAggregation>): GroupStatsItem => ({
  title: i18n.STATS_GROUP_RULES,
  badge: {
    value: bucket.rulesCountAggregation?.value ?? 0,
  },
});

interface SingleSeverityProps {
  /**
   * Aggregation buckets for severities
   */
  severities: GenericBuckets[];
}

/**
 * Returns a colored icon and severity value (low, medium, high or critical) if only a single bucket is passed in.
 * If the value of the severity is null or incorrect, we return Unknown.
 * If there are multiple buckets, we return multiple icons.
 */
export const Severity = memo(({ severities }: SingleSeverityProps) => {
  if (severities.length > 1) {
    return (
      <>
        <span className="smallDot">
          <EuiIcon type="dot" color="#54b399" aria-hidden={true} />
        </span>
        <span className="smallDot">
          <EuiIcon type="dot" color="#d6bf57" aria-hidden={true} />
        </span>
        <span className="smallDot">
          <EuiIcon type="dot" color="#da8b45" aria-hidden={true} />
        </span>
        <span>
          <EuiIcon type="dot" color="#e7664c" aria-hidden={true} />
        </span>
        {i18n.STATS_GROUP_SEVERITY_MULTI}
      </>
    );
  }

  const severity = severities[0].key;
  switch (severity) {
    case 'low':
      return (
        <>
          <EuiIcon type="dot" color="#54b399" aria-hidden={true} />
          {i18n.STATS_GROUP_SEVERITY_LOW}
        </>
      );
    case 'medium':
      return (
        <>
          <EuiIcon type="dot" color="#d6bf57" aria-hidden={true} />
          {i18n.STATS_GROUP_SEVERITY_MEDIUM}
        </>
      );
    case 'high':
      return (
        <>
          <EuiIcon type="dot" color="#da8b45" aria-hidden={true} />
          {i18n.STATS_GROUP_SEVERITY_HIGH}
        </>
      );
    case 'critical':
      return (
        <>
          <EuiIcon type="dot" color="#e7664c" aria-hidden={true} />
          {i18n.STATS_GROUP_SEVERITY_CRITICAL}
        </>
      );
    default:
      return <>{i18n.STATS_GROUP_SEVERITY_UNKNOWN}</>;
  }
});
Severity.displayName = 'Severity';

/**
 * Return a renderer for the severities aggregation.
 */
export const getSeverityComponent = (
  bucket: RawBucket<AlertsGroupingAggregation>
): GroupStatsItem[] => {
  const severities = bucket.severitiesSubAggregation?.buckets;

  if (!severities || severities.length === 0) {
    return [];
  }

  return [
    {
      title: i18n.STATS_GROUP_SEVERITY,
      component: <Severity severities={severities} />,
    },
  ];
};

/**
 * Returns statistics to be used in the`extraAction` property of the EuiAccordion component used within the kbn-grouping package.
 * It handles custom renders for the following fields:
 * - kibana.alert.rule.name
 * - host.name
 * - user.name
 * - source.ip
 * And returns a default view for all the other fields.
 *
 * This go hand in hand with defaultGroupingOptions, defaultGroupTitleRenderers and defaultGroupStatsAggregations.
 */
export const defaultGroupStatsRenderer = (
  selectedGroup: string,
  bucket: RawBucket<AlertsGroupingAggregation>
): GroupStatsItem[] => {
  const severityComponent: GroupStatsItem[] = getSeverityComponent(bucket);
  const defaultBadges: GroupStatsItem[] = DEFAULT_GROUP_STATS_RENDERER(selectedGroup, bucket);
  const usersBadge: GroupStatsItem = getUsersBadge(bucket);
  const hostsBadge: GroupStatsItem = getHostsBadge(bucket);
  const rulesBadge: GroupStatsItem = getRulesBadge(bucket);

  switch (selectedGroup) {
    case 'kibana.alert.rule.name':
      return [...severityComponent, usersBadge, hostsBadge, ...defaultBadges];
    case 'host.name':
      return [...severityComponent, usersBadge, rulesBadge, ...defaultBadges];
    case 'user.name':
    case 'source.ip':
      return [...severityComponent, hostsBadge, rulesBadge, ...defaultBadges];
  }
  return [...severityComponent, rulesBadge, ...defaultBadges];
};
