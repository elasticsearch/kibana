/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { SearchRequest } from '@elastic/elasticsearch/lib/api/types';
import { i18n } from '@kbn/i18n';
import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import {
  EuiPopover,
  EuiButtonIcon,
  EuiContextMenu,
  useEuiShadow,
  EuiPanel,
  EuiLoadingSpinner,
  EuiToolTip,
} from '@elastic/eui';
import { FETCH_STATUS, useEsSearch } from '@kbn/observability-shared-plugin/public';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { SYNTHETICS_MONITORS_EMBEDDABLE } from '../../../../../../../common/embeddables/monitors_overview/constants';
import { getSyntheticsCcsIndex } from '../../../../../../../common/get_synthetics_indices';
import { useCreateSLO } from '../../hooks/use_create_slo';
import { TEST_SCHEDULED_LABEL } from '../../../monitor_add_edit/form/run_test_btn';
import { useCanUsePublicLocById } from '../../hooks/use_can_use_public_loc_id';
import { toggleStatusAlert } from '../../../../../../../common/runtime_types/monitor_management/alert_config';
import {
  manualTestMonitorAction,
  manualTestRunInProgressSelector,
} from '../../../../state/manual_test_runs';
import { useMonitorAlertEnable } from '../../../../hooks/use_monitor_alert_enable';
import type { OverviewStatusMetaData } from '../../../../../../../common/runtime_types';
import { ConfigKey } from '../../../../../../../common/runtime_types';
import { useCanEditSynthetics } from '../../../../../../hooks/use_capabilities';
import { useMonitorEnableHandler, useLocationName, useEnablement } from '../../../../hooks';
import { setFlyoutConfig } from '../../../../state/overview/actions';
import { useEditMonitorLocator } from '../../../../hooks/use_edit_monitor_locator';
import { useMonitorDetailLocator } from '../../../../hooks/use_monitor_detail_locator';
import { NoPermissionsTooltip } from '../../../common/components/permissions';
import { useAddToDashboard } from '../../../common/components/add_to_dashboard';
import { selectOverviewView } from '../../../../state';
import { useKibanaSpace } from '../../../../../../hooks/use_kibana_space';
import {
  createRemoteMonitorCloneUrl,
  createRemoteMonitorEditUrl,
} from '../../../../utils/remote/remote_monitor_urls';

type PopoverPosition = 'relative' | 'default';

interface ActionContainerProps {
  boxShadow: string;
  position: PopoverPosition;
}

const Container = styled.div<ActionContainerProps>`
  ${({ position }) =>
    position === 'relative'
      ? // custom styles used to overlay the popover button on `MetricItem`
        `
  display: inline-block;
  position: relative;
  bottom: 42px;
  left: 12px;
  z-index: 1;
`
      : // otherwise, no custom position needed
        ''}

  border-radius: ${({ theme }) => theme.eui.euiBorderRadius};
  ${({ boxShadow, position }) => (position === 'relative' ? boxShadow : '')}
`;

interface Props {
  isPopoverOpen: boolean;
  isInspectView?: boolean;
  monitor: OverviewStatusMetaData;
  setIsPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  position: PopoverPosition;
  iconHasPanel?: boolean;
  iconSize?: 's' | 'xs';
  locationId: string;
  renderButton?: (onClick: () => void) => NonNullable<React.ReactNode>;
  kibanaUrl?: string;
}

/**
 * `top_metrics` can't aggregate text-mapped `kibanaUrl`, so row metadata may
 * omit it. Fall back to the latest ping over CCS, gated on `enabled` so the
 * cost only happens when the user opens the menu, never per row at render.
 */
const useRemoteKibanaUrlFallback = ({
  enabled,
  configId,
  remoteName,
}: {
  enabled: boolean;
  configId: string;
  remoteName?: string;
}): string | undefined => {
  const index = enabled && remoteName ? getSyntheticsCcsIndex(remoteName) : '';

  const { data } = useEsSearch<
    { kibanaUrl?: string; remote?: { kibanaUrl?: string } },
    SearchRequest
  >(
    {
      index,
      size: 1,
      query: {
        bool: {
          filter: [{ term: { config_id: configId } }],
        },
      },
      sort: [{ '@timestamp': 'desc' as const }],
      _source: ['kibanaUrl', 'remote.kibanaUrl'],
    },
    [enabled, configId, remoteName],
    { name: 'getOverviewActionsPopoverRemoteKibanaUrl' }
  );

  const ping = data?.hits?.hits?.[0]?._source;
  return ping?.remote?.kibanaUrl ?? ping?.kibanaUrl;
};

const CustomShadowPanel = styled(EuiPanel)<{ shadow: string }>`
  ${(props) => props.shadow}
`;

function IconPanel({ children, hasPanel }: { children: JSX.Element; hasPanel: boolean }) {
  const shadow = useEuiShadow('s');
  if (!hasPanel) return children;
  return (
    <CustomShadowPanel
      color="plain"
      element="button"
      grow={false}
      paddingSize="none"
      hasShadow={false}
      shadow={shadow}
    >
      {children}
    </CustomShadowPanel>
  );
}

export function ActionsPopover({
  isPopoverOpen,
  isInspectView,
  setIsPopoverOpen,
  monitor,
  position,
  iconHasPanel = true,
  iconSize = 's',
  locationId,
  renderButton,
  kibanaUrl: kibanaUrlProp,
}: Props) {
  const euiShadow = useEuiShadow('l');
  const dispatch = useDispatch();
  const locationName = useLocationName(monitor);
  const isRemote = Boolean(monitor.remote);
  const { space } = useKibanaSpace();

  // Precedence mirrors the flyout: prop → overview metadata → lazy CCS fetch.
  const monitorRemoteKibanaUrl = monitor.remote?.kibanaUrl;
  const fallbackKibanaUrl = useRemoteKibanaUrlFallback({
    enabled: isPopoverOpen && isRemote && !kibanaUrlProp && !monitorRemoteKibanaUrl,
    configId: monitor.configId,
    remoteName: monitor.remote?.remoteName,
  });
  const remoteKibanaUrl = kibanaUrlProp ?? monitorRemoteKibanaUrl ?? fallbackKibanaUrl;

  const { http } = useKibana().services;
  const locationLabel = monitor.locations[0]?.label ?? '';

  const detailUrl = useMonitorDetailLocator({
    configId: monitor.configId,
    locationId: locationId || monitor.locations[0]?.id || '',
    spaces: monitor.spaces,
    remoteName: monitor.remote?.remoteName,
  });
  const editUrl = useEditMonitorLocator({ configId: monitor.configId, spaces: monitor.spaces });

  const canEditSynthetics = useCanEditSynthetics();

  const canUsePublicLocations = useCanUsePublicLocById(monitor.configId);

  const { isServiceAllowed } = useEnablement();

  const labels = useMemo(
    () => ({
      enabledSuccessLabel: enabledSuccessLabel(monitor.name),
      disabledSuccessLabel: disabledSuccessLabel(monitor.name),
      failureLabel: enabledFailLabel(monitor.name),
    }),
    [monitor.name]
  );
  const { status, isEnabled, updateMonitorEnabledState } = useMonitorEnableHandler({
    configId: monitor.configId,
    isEnabled: monitor.isEnabled,
    labels,
  });

  const { alertStatus, updateAlertEnabledState } = useMonitorAlertEnable();
  const { CreateSLOFlyout, setIsSLOFlyoutOpen } = useCreateSLO({
    configId: monitor.configId,
    label: monitor.name,
    tags: monitor.tags,
  });

  const [enableLabel, setEnableLabel] = useState(
    monitor.isEnabled ? disableMonitorLabel : enableMonitorLabel
  );

  const testInProgress = useSelector(manualTestRunInProgressSelector(monitor.configId));

  const view = useSelector(selectOverviewView);

  useEffect(() => {
    if (status === FETCH_STATUS.LOADING) {
      setEnableLabel(loadingLabel(monitor.isEnabled));
    } else if (status === FETCH_STATUS.SUCCESS) {
      setEnableLabel(isEnabled ? disableMonitorLabel : enableMonitorLabel);
      if (isPopoverOpen) setIsPopoverOpen(false);
    }
  }, [setEnableLabel, status, isEnabled, monitor.isEnabled, isPopoverOpen, setIsPopoverOpen]);

  const quickInspectPopoverItem = {
    name: quickInspectName,
    icon: 'inspect',
    disabled: !locationName,
    onClick: () => {
      if (locationName) {
        dispatch(
          setFlyoutConfig({
            locationId,
            configId: monitor.configId,
            location: locationName,
            id: monitor.configId,
          })
        );
        setIsPopoverOpen(false);
      }
    },
  };

  const { MaybeSavedObjectSaveModalDashboard, setDashboardAttachmentReady } = useAddToDashboard({
    type: SYNTHETICS_MONITORS_EMBEDDABLE,
    embeddableInput: {
      filters: {
        monitor_ids: [{ label: monitor.name, value: monitor.configId }],
        tags: [],
        locations: [{ label: locationLabel, value: locationId }],
        monitor_types: [],
        projects: [],
      },
      view,
    },
    documentTitle: `${monitor.name} - ${locationLabel}`,
    objectType: i18n.translate('xpack.synthetics.overview.actions.addToDashboard.objectTypeLabel', {
      defaultMessage: 'Monitor Overview',
    }),
  });

  const remoteEditUrl = useMemo(
    () =>
      isRemote
        ? createRemoteMonitorEditUrl({ monitor, spaceId: space?.id, kibanaUrl: remoteKibanaUrl })
        : undefined,
    [isRemote, monitor, space?.id, remoteKibanaUrl]
  );

  const remoteCloneUrl = useMemo(
    () =>
      isRemote
        ? createRemoteMonitorCloneUrl({ monitor, spaceId: space?.id, kibanaUrl: remoteKibanaUrl })
        : undefined,
    [isRemote, monitor, space?.id, remoteKibanaUrl]
  );

  const alertLoading = alertStatus(monitor.configId) === FETCH_STATUS.LOADING;

  const popoverItems: EuiContextMenuPanelItemDescriptor[] = [
    {
      name: actionsMenuGoToMonitorName,
      icon: 'sortRight',
      href: detailUrl,
      'data-test-subj': 'actionsPopoverGoToMonitor',
    },
    quickInspectPopoverItem,
    {
      name: isRemote ? (
        runTestManually
      ) : testInProgress ? (
        <EuiToolTip content={TEST_SCHEDULED_LABEL}>
          <span tabIndex={0}>{runTestManually}</span>
        </EuiToolTip>
      ) : (
        <NoPermissionsTooltip
          canUsePublicLocations={canUsePublicLocations}
          canEditSynthetics={canEditSynthetics}
        >
          {runTestManually}
        </NoPermissionsTooltip>
      ),
      icon: 'flask',
      disabled: isRemote || testInProgress || !canUsePublicLocations || !isServiceAllowed,
      toolTipContent: isRemote ? NOT_AVAILABLE_FOR_REMOTE_MONITORS : undefined,
      onClick: isRemote
        ? undefined
        : () => {
            dispatch(
              manualTestMonitorAction.get({ configId: monitor.configId, name: monitor.name })
            );
            dispatch(setFlyoutConfig(null));
            setIsPopoverOpen(false);
          },
      'data-test-subj': 'syntheticsActionsPopoverRunTestManually',
    },
    {
      name: isRemote ? (
        actionsMenuEditMonitorName
      ) : (
        <NoPermissionsTooltip canEditSynthetics={canEditSynthetics}>
          {actionsMenuEditMonitorName}
        </NoPermissionsTooltip>
      ),
      icon: 'pencil',
      disabled: isRemote ? !remoteEditUrl : !canEditSynthetics || !isServiceAllowed,
      href: isRemote ? remoteEditUrl : editUrl,
      target: isRemote ? '_blank' : undefined,
      toolTipContent: getRemoteActionTooltip(isRemote, remoteEditUrl, canEditSynthetics),
      'data-test-subj': 'editMonitorLink',
    },
    {
      name: isRemote ? (
        actionsMenuCloneMonitorName
      ) : (
        <NoPermissionsTooltip canEditSynthetics={canEditSynthetics}>
          {actionsMenuCloneMonitorName}
        </NoPermissionsTooltip>
      ),
      icon: 'copy',
      disabled: isRemote ? !remoteCloneUrl : !canEditSynthetics || !isServiceAllowed,
      href: isRemote
        ? remoteCloneUrl
        : http?.basePath.prepend(`synthetics/add-monitor?cloneId=${monitor.configId}`),
      target: isRemote ? '_blank' : undefined,
      toolTipContent: getRemoteActionTooltip(isRemote, remoteCloneUrl, canEditSynthetics),
      'data-test-subj': 'cloneMonitorLink',
    },
    {
      name: isRemote ? (
        CREATE_SLO
      ) : (
        <NoPermissionsTooltip canEditSynthetics={canEditSynthetics}>
          {CREATE_SLO}
        </NoPermissionsTooltip>
      ),
      icon: 'chartGauge',
      disabled: isRemote || !canEditSynthetics || !isServiceAllowed,
      toolTipContent: isRemote ? NOT_AVAILABLE_FOR_REMOTE_MONITORS : undefined,
      onClick: isRemote
        ? undefined
        : () => {
            setIsPopoverOpen(false);
            setIsSLOFlyoutOpen(true);
          },
      'data-test-subj': 'createSLOBtn',
    },
    {
      name: isRemote ? (
        enableLabel
      ) : (
        <NoPermissionsTooltip
          canEditSynthetics={canEditSynthetics}
          canUsePublicLocations={canUsePublicLocations}
        >
          {enableLabel}
        </NoPermissionsTooltip>
      ),
      icon: 'contrast',
      disabled: isRemote || !canEditSynthetics || !canUsePublicLocations,
      toolTipContent: isRemote ? NOT_AVAILABLE_FOR_REMOTE_MONITORS : undefined,
      onClick: isRemote
        ? undefined
        : () => {
            if (status !== FETCH_STATUS.LOADING) {
              updateMonitorEnabledState(!monitor.isEnabled);
            }
          },
      'data-test-subj': 'syntheticsActionsPopoverEnableMonitor',
    },
    {
      name: isRemote ? (
        monitor.isStatusAlertEnabled ? (
          disableAlertLabel
        ) : (
          enableMonitorAlertLabel
        )
      ) : (
        <NoPermissionsTooltip
          canEditSynthetics={canEditSynthetics}
          canUsePublicLocations={canUsePublicLocations}
        >
          {monitor.isStatusAlertEnabled ? disableAlertLabel : enableMonitorAlertLabel}
        </NoPermissionsTooltip>
      ),
      disabled: isRemote || !canEditSynthetics || !canUsePublicLocations || !isServiceAllowed,
      toolTipContent: isRemote ? NOT_AVAILABLE_FOR_REMOTE_MONITORS : undefined,
      icon: alertLoading ? (
        <EuiLoadingSpinner size="s" />
      ) : monitor.isStatusAlertEnabled ? (
        'bellSlash'
      ) : (
        'bell'
      ),
      onClick: isRemote
        ? undefined
        : () => {
            if (!alertLoading) {
              updateAlertEnabledState({
                monitor: {
                  [ConfigKey.ALERT_CONFIG]: toggleStatusAlert({
                    status: {
                      enabled: monitor.isStatusAlertEnabled,
                    },
                  }),
                },
                configId: monitor.configId,
                name: monitor.name,
              });
            }
          },
    },
    {
      name: addMonitorToDashboardLabel,
      icon: 'dashboardApp',
      disabled: isRemote,
      toolTipContent: isRemote ? NOT_AVAILABLE_FOR_REMOTE_MONITORS : undefined,
      onClick: isRemote
        ? undefined
        : () => {
            setIsPopoverOpen(false);
            setDashboardAttachmentReady(true);
          },
      'data-test-subj': 'syntheticsActionsPopoverAddToDashboard',
    },
  ];

  const visiblePopoverItems = isInspectView
    ? popoverItems.filter((i) => i !== quickInspectPopoverItem)
    : popoverItems;

  return (
    <>
      <Container boxShadow={euiShadow} position={position}>
        <EuiPopover
          button={
            renderButton ? (
              renderButton(() => setIsPopoverOpen((b: boolean) => !b))
            ) : (
              <IconPanel hasPanel={iconHasPanel}>
                <EuiToolTip content={openActionsMenuAria} disableScreenReaderOutput>
                  <EuiButtonIcon
                    data-test-subj="syntheticsActionsPopoverButton"
                    aria-label={openActionsMenuAria}
                    iconType="boxesVertical"
                    color="primary"
                    size={iconSize}
                    display="empty"
                    onClick={() => setIsPopoverOpen((b: boolean) => !b)}
                  />
                </EuiToolTip>
              </IconPanel>
            )
          }
          color="lightestShade"
          isOpen={isPopoverOpen}
          closePopover={() => setIsPopoverOpen(false)}
          anchorPosition="rightUp"
          panelPaddingSize="none"
          aria-label={i18n.translate('xpack.synthetics.actionsPopover.popoverAriaLabel', {
            defaultMessage: 'Actions menu',
          })}
        >
          <EuiContextMenu
            initialPanelId={0}
            panels={[
              {
                id: '0',
                title: actionsMenuTitle,
                items: visiblePopoverItems,
              },
            ]}
          />
        </EuiPopover>
      </Container>
      {CreateSLOFlyout}
      {MaybeSavedObjectSaveModalDashboard}
    </>
  );
}

const quickInspectName = i18n.translate('xpack.synthetics.overview.actions.quickInspect.title', {
  defaultMessage: 'Quick inspect',
});

const runTestManually = i18n.translate('xpack.synthetics.overview.actions.runTestManually.title', {
  defaultMessage: 'Run test manually',
});

const openActionsMenuAria = i18n.translate(
  'xpack.synthetics.overview.actions.openPopover.ariaLabel',
  {
    defaultMessage: 'Open actions menu',
  }
);

const actionsMenuTitle = i18n.translate('xpack.synthetics.overview.actions.menu.title', {
  defaultMessage: 'Actions',
  description: 'This is the text in the heading of a menu containing a set of actions',
});

const actionsMenuGoToMonitorName = i18n.translate(
  'xpack.synthetics.overview.actions.goToMonitor.name',
  {
    defaultMessage: 'Go to monitor',
    description:
      'This is the text for a menu item that will take the user to the monitor detail page',
  }
);

const actionsMenuEditMonitorName = i18n.translate(
  'xpack.synthetics.overview.actions.editMonitor.name',
  {
    defaultMessage: 'Edit monitor',
    description:
      'This is the text for a menu item that will take the user to the monitor edit page',
  }
);

const actionsMenuCloneMonitorName = i18n.translate(
  'xpack.synthetics.overview.actions.cloneMonitor.name',
  {
    defaultMessage: 'Clone monitor',
  }
);

const CREATE_SLO = i18n.translate('xpack.synthetics.overview.actions.createSlo.name', {
  defaultMessage: 'Create SLO',
});

const loadingLabel = (isEnabled: boolean) =>
  isEnabled
    ? i18n.translate('xpack.synthetics.overview.actions.disablingLabel', {
        defaultMessage: 'Disabling monitor',
      })
    : i18n.translate('xpack.synthetics.overview.actions.enablingLabel', {
        defaultMessage: 'Enabling monitor',
      });

const enableMonitorLabel = i18n.translate(
  'xpack.synthetics.overview.actions.enableLabelEnableMonitor',
  {
    defaultMessage: 'Enable monitor (all locations)',
  }
);

const disableMonitorLabel = i18n.translate(
  'xpack.synthetics.overview.actions.enableLabelDisableMonitor',
  {
    defaultMessage: 'Disable monitor (all locations)',
  }
);

const disableAlertLabel = i18n.translate(
  'xpack.synthetics.overview.actions.disableLabelDisableAlert',
  {
    defaultMessage: 'Disable status alerts (all locations)',
  }
);

const enableMonitorAlertLabel = i18n.translate(
  'xpack.synthetics.overview.actions.enableLabelDisableAlert',
  {
    defaultMessage: 'Enable status alerts (all locations)',
  }
);

const addMonitorToDashboardLabel = i18n.translate(
  'xpack.synthetics.overview.actions.addToDashboard',
  {
    defaultMessage: 'Add to dashboard',
  }
);

const enabledSuccessLabel = (name: string) =>
  i18n.translate('xpack.synthetics.overview.actions.enabledSuccessLabel', {
    defaultMessage: 'Monitor "{name}" enabled successfully',
    values: { name },
  });

export const disabledSuccessLabel = (name: string) =>
  i18n.translate('xpack.synthetics.overview.actions.disabledSuccessLabel', {
    defaultMessage: 'Monitor "{name}" disabled successfully.',
    values: { name },
  });

export const enabledFailLabel = (name: string) =>
  i18n.translate('xpack.synthetics.overview.actions.enabledFailLabel', {
    defaultMessage: 'Unable to update monitor "{name}".',
    values: { name },
  });

const NOT_AVAILABLE_FOR_REMOTE_MONITORS = i18n.translate(
  'xpack.synthetics.overview.actions.notAvailableForRemote',
  {
    defaultMessage: 'This action is not available for remote monitors',
  }
);

const NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL = i18n.translate(
  'xpack.synthetics.overview.actions.remoteKibanaUrlUndefined',
  {
    defaultMessage: 'This action is not available for remote monitors with undefined kibanaUrl',
  }
);

const PERMISSIONS_ON_ORIGIN_CLUSTER = i18n.translate(
  'xpack.synthetics.overview.actions.permissionsOnOriginCluster',
  {
    defaultMessage: 'Permissions are enforced on the origin cluster.',
  }
);

const getRemoteActionTooltip = (
  isRemote: boolean,
  remoteUrl: string | undefined,
  canEditSynthetics: boolean
) => {
  if (!isRemote) return undefined;
  if (!remoteUrl) return NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL;
  return canEditSynthetics ? undefined : PERMISSIONS_ON_ORIGIN_CLUSTER;
};
