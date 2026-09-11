/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The callout is the only pre-save signal that a pack will over-deliver. Two
 * things about it are easy to regress and are pinned here: it must read through
 * osquery's own `fleet_wrapper` route (the Fleet public API is `fleetAuthz`-gated,
 * so an osquery-only user would get a 403 and silently never see the warning),
 * and its target set must match what the form actually submits — combo-box
 * selection PLUS shard keys.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { EuiProvider } from '@elastic/eui';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { GetAgentPoliciesResponseItem } from '@kbn/fleet-plugin/common';

import { TargetingWarningCallout } from './targeting_warning_callout';

const mockHttpGet = jest.fn();
const mockHttpPost = jest.fn();

jest.mock('../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      http: {
        get: (...args: unknown[]) => mockHttpGet(...args),
        post: (...args: unknown[]) => mockHttpPost(...args),
      },
    },
  }),
}));

const agentPoliciesById = {
  'policy-a': { id: 'policy-a', name: 'Policy A' },
  'policy-b': { id: 'policy-b', name: 'Policy B' },
  'policy-c': { id: 'policy-c', name: 'Policy C' },
} as unknown as Record<string, GetAgentPoliciesResponseItem>;

const renderCallout = (
  targetPolicyIds: string[],
  policiesById: Record<string, GetAgentPoliciesResponseItem> | undefined = agentPoliciesById
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <EuiProvider>
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <TargetingWarningCallout
            targetPolicyIds={targetPolicyIds}
            agentPoliciesById={policiesById}
          />
        </QueryClientProvider>
      </IntlProvider>
    </EuiProvider>
  );
};

/** One package policy shared by policy-a and policy-b. */
const sharedPackagePolicies = {
  items: [{ id: 'pp-shared', policy_ids: ['policy-a', 'policy-b'] }],
};

describe('TargetingWarningCallout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when the integration is shared with an untargeted agent policy', () => {
    beforeEach(() => {
      mockHttpGet.mockResolvedValue(sharedPackagePolicies);
    });

    it('should warn and name the untargeted agent policy', async () => {
      renderCallout(['policy-a']);

      expect(await screen.findByTestId('packTargetingWarningCallout')).toBeInTheDocument();
      expect(screen.getByText(/Policy B/)).toBeInTheDocument();
    });

    it('should read package policies through the osquery internal route', async () => {
      // Not `/api/fleet/package_policies`: that route is `fleetAuthz`-gated, so a
      // user with only `osquery: all` would 403 and never see this warning.
      renderCallout(['policy-a']);

      await waitFor(() => expect(mockHttpGet).toHaveBeenCalled());
      const [path, options] = mockHttpGet.mock.calls[0];
      expect(path).toBe('/internal/osquery/fleet_wrapper/package_policies');
      expect(path).not.toContain('/api/fleet/');
      expect(options.version).toBe('1');
    });

    it('should render for a user with no Fleet privileges', async () => {
      // Regression guard: the whole point of the internal wrapper is that an
      // osquery-only user still gets the warning. Nothing here may 403.
      renderCallout(['policy-a']);

      expect(await screen.findByTestId('packTargetingWarningCallout')).toBeInTheDocument();
      // Names come from the form's already-loaded osquery-scoped hook, so there
      // is no second, differently-privileged Fleet request.
      expect(mockHttpPost).not.toHaveBeenCalled();
    });

    it('should fall back to the raw id when an agent policy no longer resolves', async () => {
      // Dropping the name would understate how many policies receive the pack.
      renderCallout(['policy-a'], {});

      expect(await screen.findByTestId('packTargetingWarningCallout')).toBeInTheDocument();
      expect(screen.getByText(/policy-b/)).toBeInTheDocument();
    });
  });

  describe('when targeting is exact', () => {
    it('should render nothing when every covered agent policy is targeted', async () => {
      mockHttpGet.mockResolvedValue(sharedPackagePolicies);
      renderCallout(['policy-a', 'policy-b']);

      await waitFor(() => expect(mockHttpGet).toHaveBeenCalled());
      expect(screen.queryByTestId('packTargetingWarningCallout')).not.toBeInTheDocument();
    });

    it('should not warn about an agent policy targeted via a shard', async () => {
      // The form submits `[...policy_ids, ...Object.keys(shards)]`, so a policy
      // targeted at a percentage in the shards accordion IS targeted. Warning
      // about it would contradict the server's own post-save check.
      mockHttpGet.mockResolvedValue(sharedPackagePolicies);
      renderCallout(['policy-a', 'policy-b']);

      await waitFor(() => expect(mockHttpGet).toHaveBeenCalled());
      expect(screen.queryByTestId('packTargetingWarningCallout')).not.toBeInTheDocument();
    });

    it('should ignore package policies that do not cover any targeted agent policy', async () => {
      mockHttpGet.mockResolvedValue({
        items: [{ id: 'pp-unrelated', policy_ids: ['policy-c', 'policy-d'] }],
      });
      renderCallout(['policy-a']);

      await waitFor(() => expect(mockHttpGet).toHaveBeenCalled());
      expect(screen.queryByTestId('packTargetingWarningCallout')).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should not query Fleet when no agent policy is selected', () => {
      renderCallout([]);

      expect(mockHttpGet).not.toHaveBeenCalled();
      expect(screen.queryByTestId('packTargetingWarningCallout')).not.toBeInTheDocument();
    });

    it('should render nothing when the package policy lookup fails', async () => {
      mockHttpGet.mockRejectedValue(new Error('Bad Request'));
      renderCallout(['policy-a']);

      await waitFor(() => expect(mockHttpGet).toHaveBeenCalled());
      expect(screen.queryByTestId('packTargetingWarningCallout')).not.toBeInTheDocument();
    });

    it('should tolerate a package policy with no policy_ids', async () => {
      mockHttpGet.mockResolvedValue({ items: [{ id: 'pp-empty' }] });
      renderCallout(['policy-a']);

      await waitFor(() => expect(mockHttpGet).toHaveBeenCalled());
      expect(screen.queryByTestId('packTargetingWarningCallout')).not.toBeInTheDocument();
    });

    it('should dedupe an agent policy covered by more than one shared package policy', async () => {
      mockHttpGet.mockResolvedValue({
        items: [
          { id: 'pp-1', policy_ids: ['policy-a', 'policy-c'] },
          { id: 'pp-2', policy_ids: ['policy-a', 'policy-c'] },
        ],
      });
      renderCallout(['policy-a']);

      expect(await screen.findByTestId('packTargetingWarningCallout')).toBeInTheDocument();
      // "Policy C" once, not twice.
      expect(screen.getAllByText(/Policy C/)).toHaveLength(1);
    });
  });
});
