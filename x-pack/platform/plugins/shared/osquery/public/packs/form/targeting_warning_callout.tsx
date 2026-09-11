/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiCallOut, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useQuery } from '@kbn/react-query';
import type { GetAgentPoliciesResponseItem } from '@kbn/fleet-plugin/common';
import { useKibana } from '../../common/lib/kibana';
import { API_VERSIONS } from '../../../common/constants';

interface PackagePolicy {
  id: string;
  policy_ids?: string[];
}

interface PackagePoliciesResponse {
  items?: PackagePolicy[];
}

interface TargetingWarningCalloutProps {
  /**
   * Every agent policy this pack will be written to — the combo-box selection
   * AND the shard keys. Must match the `policy_ids` the form submits, or this
   * warning will contradict the server's own check.
   */
  targetPolicyIds: string[];
  agentPoliciesById?: Record<string, GetAgentPoliciesResponseItem>;
}

/**
 * Warns that a pack targeted at specific agent policies will ALSO reach agent
 * policies it does not target, because the Osquery Manager integration is
 * shared across them.
 *
 * This over-delivery cannot be prevented from Kibana: `osquery_manager` declares
 * `multiple: false`, so Fleet allows only one osquery package policy per agent
 * policy and a narrower "targeted" policy cannot be created. Fleet also compiles
 * a shared package policy identically into every agent policy that references
 * it, so there is no per-agent-policy dimension in the pack block to filter on.
 * The remedy is for the user to give each agent policy its own Osquery Manager
 * integration policy in Fleet. See https://github.com/elastic/kibana/issues/285994.
 *
 * The equivalent server-side check returns `targeting_warning` on the create and
 * update responses; this component exists to surface the same fact BEFORE the
 * user saves.
 */
const TargetingWarningCalloutComponent: React.FC<TargetingWarningCalloutProps> = ({
  targetPolicyIds,
  agentPoliciesById,
}) => {
  const { http } = useKibana().services;

  // Osquery's own internal wrapper, not `/api/fleet/package_policies`: the Fleet
  // public route is `fleetAuthz`-gated, so a user with only `osquery: all` would
  // get a 403 and silently never see this warning. The wrapper is `osquery-read`
  // gated and reads through an internal SO client, which is the whole reason
  // every other Fleet lookup in this plugin goes through `fleet_wrapper`.
  const { data: packagePoliciesData } = useQuery<PackagePoliciesResponse>(
    ['osquery-package-policies-for-targeting-check'],
    () =>
      http.get('/internal/osquery/fleet_wrapper/package_policies', {
        version: API_VERSIONS.internal.v1,
      }),
    {
      staleTime: 30_000,
      enabled: targetPolicyIds.length > 0,
    }
  );

  const untargetedPolicyIds = useMemo(() => {
    if (!targetPolicyIds.length || !packagePoliciesData?.items) return [];

    const targetSet = new Set(targetPolicyIds);
    const untargeted = new Set<string>();

    for (const packagePolicy of packagePoliciesData.items) {
      const packagePolicyIds = packagePolicy.policy_ids ?? [];
      // Only package policies this pack actually writes to can over-deliver.
      if (!packagePolicyIds.some((id) => targetSet.has(id))) continue;

      for (const id of packagePolicyIds) {
        if (!targetSet.has(id)) {
          untargeted.add(id);
        }
      }
    }

    return [...untargeted];
  }, [packagePoliciesData, targetPolicyIds]);

  const untargetedNames = useMemo(
    () =>
      // Fall back to the raw id for an agent policy that did not resolve: listing
      // fewer policies than actually receive the pack would understate the reach.
      untargetedPolicyIds.map((id) => agentPoliciesById?.[id]?.name || id),
    [agentPoliciesById, untargetedPolicyIds]
  );

  if (!untargetedNames.length) return null;

  return (
    <>
      <EuiSpacer size="m" />
      {/* aria-live region so assistive technology announces this as a status message */}
      <div role="status" aria-live="polite" aria-atomic="true">
        <EuiCallOut
          title={i18n.translate('xpack.osquery.pack.form.targetingWarning.title', {
            defaultMessage: 'This pack will also run on other agent policies',
          })}
          color="warning"
          iconType="warning"
          data-test-subj="packTargetingWarningCallout"
        >
          <FormattedMessage
            id="xpack.osquery.pack.form.targetingWarning.body"
            defaultMessage="The Osquery Manager integration is shared with {count, plural, one {an agent policy} other {agent policies}} that this pack does not target, and a shared integration delivers the same configuration to every policy that uses it. This pack will therefore also run on: {names}. To limit it to the policies you selected, give each agent policy its own Osquery Manager integration policy in Fleet."
            // Inline literal: the i18n validator resolves `values` statically and
            // cannot see through a variable reference. Same pattern as
            // agents_table.tsx — the render is gated on a non-empty list above.
            // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
            values={{ count: untargetedNames.length, names: untargetedNames.join(', ') }}
          />
        </EuiCallOut>
      </div>
    </>
  );
};

export const TargetingWarningCallout = React.memo(TargetingWarningCalloutComponent);
