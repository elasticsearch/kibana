/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { ExpandableFlyout, type ExpandableFlyoutProps } from '@kbn/expandable-flyout';
import { useEuiTheme } from '@elastic/eui';
import type {
  FindingsMisconfigurationPanelExpandableFlyoutPropsNonPreview,
  FindingsMisconfigurationPanelExpandableFlyoutPropsPreview,
  FindingsVulnerabilityPanelExpandableFlyoutPropsNonPreview,
  FindingsVulnerabilityPanelExpandableFlyoutPropsPreview,
} from '@kbn/cloud-security-posture';
import type { GraphGroupedNodePreviewPanelProps } from '@kbn/cloud-security-posture-graph';
import { GraphGroupedNodePreviewPanelKey } from '@kbn/cloud-security-posture-graph';
import type { GenericEntityDetailsExpandableFlyoutProps } from './entity_details/generic_details_left';
import {
  GenericEntityDetailsPanel,
  GenericEntityDetailsPanelKey,
} from './entity_details/generic_details_left';
import type { GenericEntityPanelExpandableFlyoutProps } from './entity_details/generic_right';
import { GenericEntityPanel } from './entity_details/generic_right';
import type { EaseDetailsProps } from './ease/types';
import { EaseDetailsProvider } from './ease/context';
import { EasePanel } from './ease';
import { SessionViewPanelProvider } from './document_details/session_view/context';
import type { SessionViewPanelProps } from './document_details/session_view';
import { SessionViewPanel } from './document_details/session_view';
import type { NetworkExpandableFlyoutProps } from './network_details';
import { NetworkPanel, NetworkPanelKey, NetworkPreviewPanelKey } from './network_details';
import { Flyouts } from './document_details/shared/constants/flyouts';
import {
  DocumentDetailsAnalyzerPanelKey,
  DocumentDetailsLeftPanelKey,
  DocumentDetailsPreviewPanelKey,
  DocumentDetailsRightPanelKey,
  DocumentDetailsSessionViewPanelKey,
} from './document_details/shared/constants/panel_keys';
import type { DocumentDetailsProps } from './document_details/shared/types';
import { DocumentDetailsProvider } from './document_details/shared/context';
import { RightPanel } from './document_details/right';
import { LeftPanel } from './document_details/left';
import { PreviewPanel } from './document_details/preview';
import type { RulePanelExpandableFlyoutProps } from './rule_details/right';
import { RulePanel, RulePanelKey, RulePreviewPanelKey } from './rule_details/right';
import type { UserPanelExpandableFlyoutProps } from './entity_details/user_right';
import { UserPanel, UserPreviewPanelKey } from './entity_details/user_right';
import type { UserDetailsExpandableFlyoutProps } from './entity_details/user_details_left';
import { UserDetailsPanel, UserDetailsPanelKey } from './entity_details/user_details_left';
import type { HostPanelExpandableFlyoutProps } from './entity_details/host_right';
import { HostPanel, HostPreviewPanelKey } from './entity_details/host_right';
import type { HostDetailsExpandableFlyoutProps } from './entity_details/host_details_left';
import { HostDetailsPanel, HostDetailsPanelKey } from './entity_details/host_details_left';
import type { AnalyzerPanelExpandableFlyoutProps } from './document_details/analyzer_panels';
import { AnalyzerPanel } from './document_details/analyzer_panels';
import {
  GenericEntityPanelKey,
  HostPanelKey,
  ServicePanelKey,
  WatchlistsFlyoutKey,
  UserPanelKey,
} from './entity_details/shared/constants';
import type { ServicePanelExpandableFlyoutProps } from './entity_details/service_right';
import { ServicePanel } from './entity_details/service_right';
import type { ServiceDetailsExpandableFlyoutProps } from './entity_details/service_details_left';
import { ServiceDetailsPanel, ServiceDetailsPanelKey } from './entity_details/service_details_left';
import {
  ATTACK_DETAILS_LEFT_PANEL_ARIA_LABEL,
  ATTACK_DETAILS_PREVIEW_PANEL_ARIA_LABEL,
  ATTACK_DETAILS_RIGHT_PANEL_ARIA_LABEL,
  DOCUMENT_DETAILS_ANALYZER_PANEL_ARIA_LABEL,
  DOCUMENT_DETAILS_LEFT_PANEL_ARIA_LABEL,
  DOCUMENT_DETAILS_PREVIEW_PANEL_ARIA_LABEL,
  DOCUMENT_DETAILS_RIGHT_PANEL_ARIA_LABEL,
  DOCUMENT_DETAILS_SESSION_VIEW_PANEL_ARIA_LABEL,
  EASE_PANEL_ARIA_LABEL,
  GENERIC_ENTITY_DETAILS_PANEL_ARIA_LABEL,
  GENERIC_ENTITY_PANEL_ARIA_LABEL,
  GRAPH_GROUPED_NODE_PREVIEW_PANEL_ARIA_LABEL,
  HOST_DETAILS_PANEL_ARIA_LABEL,
  HOST_PANEL_ARIA_LABEL,
  HOST_PREVIEW_PANEL_ARIA_LABEL,
  IOC_RIGHT_PANEL_ARIA_LABEL,
  MISCONFIGURATION_FINDINGS_PREVIEW_PANEL_ARIA_LABEL,
  MISCONFIGURATION_PANEL_ARIA_LABEL,
  NETWORK_PANEL_ARIA_LABEL,
  NETWORK_PREVIEW_PANEL_ARIA_LABEL,
  RULE_PANEL_ARIA_LABEL,
  RULE_PREVIEW_PANEL_ARIA_LABEL,
  SERVICE_DETAILS_PANEL_ARIA_LABEL,
  SERVICE_PANEL_ARIA_LABEL,
  USER_DETAILS_PANEL_ARIA_LABEL,
  USER_PANEL_ARIA_LABEL,
  USER_PREVIEW_PANEL_ARIA_LABEL,
  VULNERABILITY_FINDINGS_PANEL_ARIA_LABEL,
  VULNERABILITY_FINDINGS_PREVIEW_PANEL_ARIA_LABEL,
  WATCHLISTS_PANEL_ARIA_LABEL,
  ALERTS_V2_DETAILS_PANEL_ARIA_LABEL,
} from './panel_aria_labels';
import type { WatchlistsFlyoutExpandableFlyoutProps } from './entity_details/watchlists_right';
import { WatchlistsFlyoutPanel } from './entity_details/watchlists_right';
import {
  MisconfigurationFindingsPanelKey,
  MisconfigurationFindingsPreviewPanelKey,
} from './csp_details/findings_flyout/constants';
import { FindingsMisconfigurationPanel } from './csp_details/findings_flyout/findings_right';
import { EasePanelKey } from './ease/constants/panel_keys';
import {
  VulnerabilityFindingsPanelKey,
  VulnerabilityFindingsPreviewPanelKey,
} from './csp_details/vulnerabilities_flyout/constants';
import { FindingsVulnerabilityPanel } from './csp_details/vulnerabilities_flyout/vulnerabilities_right';
import {
  AttackDetailsLeftPanelKey,
  AttackDetailsPreviewPanelKey,
  AttackDetailsRightPanelKey,
} from './attack_details/constants/panel_keys';
import type { AttackDetailsProps } from './attack_details/types';
import { AttackDetailsProvider } from './attack_details/context';
import { AttackDetailsPreviewPanel, AttackDetailsRightPanel } from './attack_details';
import { AttackDetailsLeftPanel } from './attack_details/left';
import type { IOCDetailsProps } from './ioc_details/types';
import { IOCDetailsProvider } from './ioc_details/context';
import { IOCPanel } from './ioc_details';
import { IOCRightPanelKey } from './ioc_details/constants/panel_keys';
import { AlertsV2DetailsPanelKey } from '../alerts_v2/constants';
import type { AlertsV2DetailsPanelProps } from '../alerts_v2/pages/alerts_v2_flyout_panel';
import { AlertsV2DetailsPanel } from '../alerts_v2/pages/alerts_v2_flyout_panel';

const GraphGroupedNodePreviewPanel = React.lazy(() =>
  import('@kbn/cloud-security-posture-graph').then((module) => ({
    default: module.GraphGroupedNodePreviewPanel,
  }))
);

/**
 * List of all panels that will be used within the document details expandable flyout.
 * This needs to be passed to the expandable flyout registeredPanels property.
 */
export const expandableFlyoutDocumentsPanels: ExpandableFlyoutProps['registeredPanels'] = [
  {
    key: DocumentDetailsRightPanelKey,
    component: (props) => (
      <DocumentDetailsProvider {...(props as DocumentDetailsProps).params}>
        <RightPanel path={props.path as DocumentDetailsProps['path']} />
      </DocumentDetailsProvider>
    ),
    'aria-label': DOCUMENT_DETAILS_RIGHT_PANEL_ARIA_LABEL,
  },
  {
    key: DocumentDetailsLeftPanelKey,
    component: (props) => (
      <DocumentDetailsProvider {...(props as DocumentDetailsProps).params}>
        <LeftPanel path={props.path as DocumentDetailsProps['path']} />
      </DocumentDetailsProvider>
    ),
    'aria-label': DOCUMENT_DETAILS_LEFT_PANEL_ARIA_LABEL,
  },
  {
    key: DocumentDetailsPreviewPanelKey,
    component: (props) => (
      <DocumentDetailsProvider {...(props as DocumentDetailsProps).params}>
        <PreviewPanel path={props.path as DocumentDetailsProps['path']} />
      </DocumentDetailsProvider>
    ),
    'aria-label': DOCUMENT_DETAILS_PREVIEW_PANEL_ARIA_LABEL,
  },
  {
    key: GraphGroupedNodePreviewPanelKey,
    component: (props) => {
      // TODO Fix typing issue here
      const params = props.params as unknown as GraphGroupedNodePreviewPanelProps;
      return <GraphGroupedNodePreviewPanel {...params} />;
    },
    'aria-label': GRAPH_GROUPED_NODE_PREVIEW_PANEL_ARIA_LABEL,
  },
  {
    key: RulePanelKey,
    component: (props) => <RulePanel {...(props as RulePanelExpandableFlyoutProps).params} />,
    'aria-label': RULE_PANEL_ARIA_LABEL,
  },
  {
    key: RulePreviewPanelKey,
    component: (props) => (
      <RulePanel {...(props as RulePanelExpandableFlyoutProps).params} isPreviewMode />
    ),
    'aria-label': RULE_PREVIEW_PANEL_ARIA_LABEL,
  },
  {
    key: DocumentDetailsAnalyzerPanelKey,
    component: (props) => (
      <AnalyzerPanel {...(props as AnalyzerPanelExpandableFlyoutProps).params} />
    ),
    'aria-label': DOCUMENT_DETAILS_ANALYZER_PANEL_ARIA_LABEL,
  },
  {
    key: DocumentDetailsSessionViewPanelKey,
    component: (props) => (
      <SessionViewPanelProvider {...(props as SessionViewPanelProps).params}>
        <SessionViewPanel path={props.path as SessionViewPanelProps['path']} />
      </SessionViewPanelProvider>
    ),
    'aria-label': DOCUMENT_DETAILS_SESSION_VIEW_PANEL_ARIA_LABEL,
  },
  {
    key: UserPanelKey,
    component: (props) => <UserPanel {...(props as UserPanelExpandableFlyoutProps).params} />,
    'aria-label': USER_PANEL_ARIA_LABEL,
  },
  {
    key: UserDetailsPanelKey,
    component: (props) => (
      <UserDetailsPanel {...(props as UserDetailsExpandableFlyoutProps).params} />
    ),
    'aria-label': USER_DETAILS_PANEL_ARIA_LABEL,
  },
  {
    key: UserPreviewPanelKey,
    component: (props) => (
      <UserPanel {...(props as UserPanelExpandableFlyoutProps).params} isPreviewMode />
    ),
    'aria-label': USER_PREVIEW_PANEL_ARIA_LABEL,
  },
  {
    key: HostPanelKey,
    component: (props) => <HostPanel {...(props as HostPanelExpandableFlyoutProps).params} />,
    'aria-label': HOST_PANEL_ARIA_LABEL,
  },
  {
    key: HostDetailsPanelKey,
    component: (props) => (
      <HostDetailsPanel {...(props as HostDetailsExpandableFlyoutProps).params} />
    ),
    'aria-label': HOST_DETAILS_PANEL_ARIA_LABEL,
  },
  {
    key: HostPreviewPanelKey,
    component: (props) => (
      <HostPanel {...(props as HostPanelExpandableFlyoutProps).params} isPreviewMode />
    ),
    'aria-label': HOST_PREVIEW_PANEL_ARIA_LABEL,
  },
  {
    key: NetworkPanelKey,
    component: (props) => <NetworkPanel {...(props as NetworkExpandableFlyoutProps).params} />,
    'aria-label': NETWORK_PANEL_ARIA_LABEL,
  },
  {
    key: NetworkPreviewPanelKey,
    component: (props) => (
      <NetworkPanel {...(props as NetworkExpandableFlyoutProps).params} isPreviewMode />
    ),
    'aria-label': NETWORK_PREVIEW_PANEL_ARIA_LABEL,
  },

  {
    key: ServicePanelKey,
    component: (props) => <ServicePanel {...(props as ServicePanelExpandableFlyoutProps).params} />,
    'aria-label': SERVICE_PANEL_ARIA_LABEL,
  },
  {
    key: ServiceDetailsPanelKey,
    component: (props) => (
      <ServiceDetailsPanel {...(props as ServiceDetailsExpandableFlyoutProps).params} />
    ),
    'aria-label': SERVICE_DETAILS_PANEL_ARIA_LABEL,
  },
  {
    key: GenericEntityPanelKey,
    component: (props) => (
      <GenericEntityPanel {...(props as GenericEntityPanelExpandableFlyoutProps).params} />
    ),
    'aria-label': GENERIC_ENTITY_PANEL_ARIA_LABEL,
  },
  {
    key: GenericEntityDetailsPanelKey,
    component: (props) => (
      <GenericEntityDetailsPanel {...(props as GenericEntityDetailsExpandableFlyoutProps).params} />
    ),
    'aria-label': GENERIC_ENTITY_DETAILS_PANEL_ARIA_LABEL,
  },
  {
    key: MisconfigurationFindingsPanelKey,
    component: (props) => (
      <FindingsMisconfigurationPanel
        {...(props as FindingsMisconfigurationPanelExpandableFlyoutPropsNonPreview).params}
      />
    ),
    'aria-label': MISCONFIGURATION_PANEL_ARIA_LABEL,
  },
  {
    key: EasePanelKey,
    component: (props) => (
      <EaseDetailsProvider {...(props as EaseDetailsProps).params}>
        <EasePanel />
      </EaseDetailsProvider>
    ),
    'aria-label': EASE_PANEL_ARIA_LABEL,
  },
  {
    key: AttackDetailsRightPanelKey,
    component: (props) => (
      <AttackDetailsProvider {...(props as AttackDetailsProps).params}>
        <AttackDetailsRightPanel path={props.path as AttackDetailsProps['path']} />
      </AttackDetailsProvider>
    ),
    'aria-label': ATTACK_DETAILS_RIGHT_PANEL_ARIA_LABEL,
  },
  {
    key: AttackDetailsPreviewPanelKey,
    component: (props) => (
      <AttackDetailsProvider {...(props as AttackDetailsProps).params} isPreviewMode={true}>
        <AttackDetailsPreviewPanel path={props.path as AttackDetailsProps['path']} />
      </AttackDetailsProvider>
    ),
    'aria-label': ATTACK_DETAILS_PREVIEW_PANEL_ARIA_LABEL,
  },
  {
    key: AttackDetailsLeftPanelKey,
    component: (props) => (
      <AttackDetailsProvider {...(props as AttackDetailsProps).params}>
        <AttackDetailsLeftPanel path={props.path as AttackDetailsProps['path']} />
      </AttackDetailsProvider>
    ),
    'aria-label': ATTACK_DETAILS_LEFT_PANEL_ARIA_LABEL,
  },
  {
    key: MisconfigurationFindingsPreviewPanelKey,
    component: (props) => (
      <FindingsMisconfigurationPanel
        {...(props as FindingsMisconfigurationPanelExpandableFlyoutPropsPreview).params}
      />
    ),
    'aria-label': MISCONFIGURATION_FINDINGS_PREVIEW_PANEL_ARIA_LABEL,
  },
  {
    key: VulnerabilityFindingsPanelKey,
    component: (props) => (
      <FindingsVulnerabilityPanel
        {...(props as FindingsVulnerabilityPanelExpandableFlyoutPropsNonPreview).params}
      />
    ),
    'aria-label': VULNERABILITY_FINDINGS_PANEL_ARIA_LABEL,
  },
  {
    key: VulnerabilityFindingsPreviewPanelKey,
    component: (props) => (
      <FindingsVulnerabilityPanel
        {...(props as FindingsVulnerabilityPanelExpandableFlyoutPropsPreview).params}
      />
    ),
    'aria-label': VULNERABILITY_FINDINGS_PREVIEW_PANEL_ARIA_LABEL,
  },
  {
    key: IOCRightPanelKey,
    component: (props) => (
      <IOCDetailsProvider {...(props as IOCDetailsProps).params}>
        <IOCPanel path={props.path as IOCDetailsProps['path']} />
      </IOCDetailsProvider>
    ),
    'aria-label': IOC_RIGHT_PANEL_ARIA_LABEL,
  },
  {
    key: WatchlistsFlyoutKey,
    component: (props) => (
      <WatchlistsFlyoutPanel {...(props as WatchlistsFlyoutExpandableFlyoutProps).params} />
    ),
    'aria-label': WATCHLISTS_PANEL_ARIA_LABEL,
  },
  {
    key: AlertsV2DetailsPanelKey,
    component: (props) => (
      <AlertsV2DetailsPanel {...(props as unknown as AlertsV2DetailsPanelProps)} />
    ),
    'aria-label': ALERTS_V2_DETAILS_PANEL_ARIA_LABEL,
  },
];

export const SECURITY_SOLUTION_ON_CLOSE_EVENT = `expandable-flyout-on-close-${Flyouts.securitySolution}`;
export const TIMELINE_ON_CLOSE_EVENT = `expandable-flyout-on-close-${Flyouts.timeline}`;

/**
 * Flyout used for the Security Solution application
 * We keep the default EUI 1001 z-index to ensure it is always rendered behind Timeline (which has a z-index of 1002)
 * We propagate the onClose callback to the rest of Security Solution using a window event 'expandable-flyout-on-close-SecuritySolution'
 * This flyout support push/overlay mode. The value is saved in local storage.
 */
export const SecuritySolutionFlyout = memo(() => {
  const { euiTheme } = useEuiTheme();

  const onClose = useCallback(
    () =>
      window.dispatchEvent(
        new CustomEvent(SECURITY_SOLUTION_ON_CLOSE_EVENT, {
          detail: Flyouts.securitySolution,
        })
      ),
    []
  );

  return (
    <ExpandableFlyout
      registeredPanels={expandableFlyoutDocumentsPanels}
      paddingSize="none"
      customStyles={{ 'z-index': (euiTheme.levels.flyout as number) + 1 }}
      onClose={onClose}
    />
  );
});

SecuritySolutionFlyout.displayName = 'SecuritySolutionFlyout';

/**
 * Flyout used in Timeline
 * We set the z-index to 1003 to ensure it is always rendered above Timeline (which has a z-index of 1002)
 * We propagate the onClose callback to the rest of Security Solution using a window event 'expandable-flyout-on-close-Timeline'
 * This flyout does not support push mode, because timeline being rendered in a modal (EUiPortal), it's very difficult to dynamically change its width.
 */
export const TimelineFlyout = memo(() => {
  const { euiTheme } = useEuiTheme();

  const onClose = useCallback(
    () =>
      window.dispatchEvent(
        new CustomEvent(TIMELINE_ON_CLOSE_EVENT, {
          detail: Flyouts.timeline,
        })
      ),
    []
  );

  return (
    <ExpandableFlyout
      registeredPanels={expandableFlyoutDocumentsPanels}
      paddingSize="none"
      customStyles={{ 'z-index': (euiTheme.levels.flyout as number) + 3 }}
      onClose={onClose}
      flyoutCustomProps={{
        pushVsOverlay: {
          disabled: true,
          tooltip: 'Push mode is not supported in Timeline',
        },
      }}
    />
  );
});

TimelineFlyout.displayName = 'TimelineFlyout';
