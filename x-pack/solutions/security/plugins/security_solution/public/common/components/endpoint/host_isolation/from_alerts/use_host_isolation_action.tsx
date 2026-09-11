/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useCallback, useMemo } from 'react';
import type { TimelineEventsDetailsItem } from '@kbn/timelines-plugin/common';
import { isNonLocalIndexName } from '@kbn/es-query';
import {
  ENDPOINT_VERSION_NOT_SUPPORTED,
  HOST_ISOLATION,
} from '../../../../../management/common/translations';
import { useGetEndpointDetails } from '../../../../../management/hooks';
import {
  HOST_ENDPOINT_UNENROLLED_TOOLTIP,
  LOADING_ENDPOINT_DATA_TOOLTIP,
  NOT_FROM_ENDPOINT_HOST_TOOLTIP,
} from '../../responder';
import { useAlertResponseActionsSupport } from '../../../../hooks/endpoint/use_alert_response_actions_support';
import { HostStatus } from '../../../../../../common/endpoint/types';
import { getEventDetailsFieldValues } from '../../../../lib/endpoint/utils/get_event_details_field_values';
import { useKibana } from '../../../../lib/kibana';
import { HOST_ON_LINKED_PROJECT_TOOLTIP, ISOLATE_HOST, UNISOLATE_HOST } from './translations';
import { useUserPrivileges } from '../../../user_privileges';
import type { AlertTableContextMenuItem } from '../../../../../detections/components/alerts_table/types';
import { useGetAgentStatus } from '../../../../../management/hooks/agents/use_get_agent_status';

export type HostIsolationAction = 'isolateHost' | 'unisolateHost';
export const ISOLATE_HOST_ACTION_ID = 'isolate-host-action-item';

export interface UseHostIsolationActionProps {
  closePopover: () => void;
  detailsData: TimelineEventsDetailsItem[] | null;
  onAddIsolationStatusClick: (action: HostIsolationAction) => void;
}

const emptyArray: AlertTableContextMenuItem[] = [];

export const useHostIsolationAction = ({
  closePopover,
  detailsData,
  onAddIsolationStatusClick,
}: UseHostIsolationActionProps): AlertTableContextMenuItem[] => {
  const {
    isSupported: hostSupportsResponseActions,
    unsupportedReason,
    details: {
      agentType,
      agentId,
      agentSupport: { isolate: isolationSupported },
    },
  } = useAlertResponseActionsSupport(detailsData);
  const { canIsolateHost, canUnIsolateHost } = useUserPrivileges().endpointPrivileges;
  const { data, isLoading, isFetched } = useGetAgentStatus(agentId, agentType, {
    enabled: hostSupportsResponseActions,
  });
  const agentStatus = data?.[agentId];
  const isHostAgentUnEnrolled = useMemo<boolean>(() => {
    return (
      !hostSupportsResponseActions ||
      !agentStatus?.found ||
      agentStatus.status === HostStatus.UNENROLLED
    );
  }, [hostSupportsResponseActions, agentStatus]);

  const { data: hostMetadata } = useGetEndpointDetails(agentId, {
    enabled: hostSupportsResponseActions && agentType === 'endpoint',
  });

  const doesHostSupportIsolation = useMemo(() => {
    return hostSupportsResponseActions && isolationSupported;
  }, [hostSupportsResponseActions, isolationSupported]);

  const isHostIsolated = useMemo(() => {
    return Boolean(agentStatus?.isolated);
  }, [agentStatus?.isolated]);

  const isolateHostHandler = useCallback(() => {
    closePopover();

    if (doesHostSupportIsolation) {
      if (!isHostIsolated) {
        onAddIsolationStatusClick('isolateHost');
      } else {
        onAddIsolationStatusClick('unisolateHost');
      }
    }
  }, [closePopover, doesHostSupportIsolation, isHostIsolated, onAddIsolationStatusClick]);

  // Only meaningful when CPS is on: `cpsManager` is present solely on CPS-enabled deployments. Off
  // CPS (including CCS deployments), an ancestor index can legitimately carry a remote-cluster prefix
  // that `isNonLocalIndexName` would flag, so the check must be gated to avoid a false positive.
  const isCpsEnabled = Boolean(useKibana().services.cps?.cpsManager);

  // In a Cross-Project Search deployment an alert can be generated off a document that lives in a
  // linked project even though the alert itself is stored locally. The host is then only visible to
  // the origin via a fanned-out (project-routed) search, while response actions run origin-only and
  // reject the host as not enrolled. Elasticsearch prefixes the source `_index` with the project
  // alias, so a non-local ancestor index is the signal that the host belongs to a linked project.
  const isHostFromLinkedProject = useMemo<boolean>(
    () =>
      isCpsEnabled &&
      getEventDetailsFieldValues(
        { category: 'kibana', field: 'kibana.alert.ancestors.index' },
        detailsData
      ).some(isNonLocalIndexName),
    [isCpsEnabled, detailsData]
  );

  return useMemo<AlertTableContextMenuItem[]>(() => {
    // If user has no Authz, then don't show the menu item at all
    if ((isHostIsolated && !canUnIsolateHost) || !canIsolateHost) {
      return emptyArray;
    }

    const menuItem: AlertTableContextMenuItem = {
      key: ISOLATE_HOST_ACTION_ID,
      'data-test-subj': 'isolate-host-action-item',
      disabled: isHostAgentUnEnrolled,
      onClick: isolateHostHandler,
      name: isHostIsolated ? UNISOLATE_HOST : ISOLATE_HOST,
    };

    // Determine if menu item should be disabled
    if (isHostFromLinkedProject) {
      // Checked first so its reason wins: agent status fans out and reports the linked host as
      // enrolled, so the other branches below would otherwise show a misleading tooltip.
      menuItem.disabled = true;
      menuItem.toolTipContent = HOST_ON_LINKED_PROJECT_TOOLTIP;
    } else if (!doesHostSupportIsolation) {
      menuItem.disabled = true;
      // If we were able to calculate the agentType and we have a reason why the host is does not
      // support response actions, then show that as the tooltip. Else, just show the normal "enroll" message
      menuItem.toolTipContent =
        agentType && unsupportedReason ? unsupportedReason : NOT_FROM_ENDPOINT_HOST_TOOLTIP;
    } else if (isLoading || !isFetched) {
      menuItem.disabled = true;
      menuItem.toolTipContent = LOADING_ENDPOINT_DATA_TOOLTIP;
    } else if (isHostAgentUnEnrolled) {
      menuItem.disabled = true;
      menuItem.toolTipContent =
        agentType === 'endpoint'
          ? HOST_ENDPOINT_UNENROLLED_TOOLTIP
          : NOT_FROM_ENDPOINT_HOST_TOOLTIP;
    } else if (
      agentType === 'endpoint' &&
      !hostMetadata?.metadata.Endpoint.capabilities?.includes('isolation')
    ) {
      menuItem.disabled = true;
      menuItem.toolTipContent = ENDPOINT_VERSION_NOT_SUPPORTED(HOST_ISOLATION);
    }

    return [menuItem];
  }, [
    isHostIsolated,
    canUnIsolateHost,
    canIsolateHost,
    isHostAgentUnEnrolled,
    agentType,
    hostMetadata?.metadata.Endpoint.capabilities,
    isolateHostHandler,
    isHostFromLinkedProject,
    doesHostSupportIsolation,
    isLoading,
    isFetched,
    unsupportedReason,
  ]);
};
