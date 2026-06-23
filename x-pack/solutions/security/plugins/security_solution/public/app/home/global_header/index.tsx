/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiHeaderLink,
  EuiHeaderLinks,
  EuiHeaderSection,
  EuiHeaderSectionItem,
} from '@elastic/eui';
import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { createHtmlPortalNode, InPortal, OutPortal } from 'react-reverse-portal';
import { i18n } from '@kbn/i18n';
import { toMountPoint } from '@kbn/react-kibana-mount';
import { PageScope } from '../../../data_view_manager/constants';
import { SECURITY_FEATURE_ID } from '../../../../common';
import { MlPopover } from '../../../common/components/ml_popover/ml_popover';
import { useKibana } from '../../../common/lib/kibana';
import { isDashboardViewPath, isDetectionsPath, isRuleChangesHistoryPath } from '../../../helpers';
import { TimelineId } from '../../../../common/types/timeline';
import { timelineDefaults } from '../../../timelines/store/defaults';
import { timelineSelectors } from '../../../timelines/store';
import { useShallowEqualSelector } from '../../../common/hooks/use_selector';
import {
  getScopeFromPath,
  showDataViewPickerByPath,
} from '../../../sourcerer/containers/sourcerer_paths';
import { useAddIntegrationsUrl } from '../../../common/hooks/use_add_integrations_url';
import { DataViewPicker } from '../../../data_view_manager/components/data_view_picker';

const BUTTON_ADD_DATA = i18n.translate('xpack.securitySolution.globalHeader.buttonAddData', {
  defaultMessage: 'Add integrations',
});

/**
 * This component uses the reverse portal to add the Add Data, ML job settings, and AI Assistant buttons on the
 * right hand side of the Kibana global header
 */
export const GlobalHeader = React.memo(() => {
  const portalNode = useMemo(() => createHtmlPortalNode(), []);
  const {
    theme,
    setHeaderActionMenu,
    i18n: kibanaServiceI18n,
    application: { capabilities },
  } = useKibana().services;
  const hasSearchAILakeConfigurations = capabilities[SECURITY_FEATURE_ID]?.configurations === true;
  const canReadFleet = capabilities.fleet.read === true;
  const canAddData = canReadFleet && !hasSearchAILakeConfigurations;
  const { pathname } = useLocation();

  const getTimeline = useMemo(() => timelineSelectors.getTimelineByIdSelector(), []);
  const showTimeline = useShallowEqualSelector(
    (state) => (getTimeline(state, TimelineId.active) ?? timelineDefaults).show
  );

  const pageScope = getScopeFromPath(pathname);
  const showDataViewPicker = showDataViewPickerByPath(pathname);
  const dashboardViewPath = isDashboardViewPath(pathname);
  const changesHistoryPath = isRuleChangesHistoryPath(pathname);

  const { href, onClick } = useAddIntegrationsUrl();

  useEffect(() => {
    if (!setHeaderActionMenu) {
      return;
    }

    if (changesHistoryPath) {
      setHeaderActionMenu(undefined);
      return;
    }

    setHeaderActionMenu((element) => {
      const mount = toMountPoint(<OutPortal node={portalNode} />, {
        theme,
        i18n: kibanaServiceI18n,
      });
      return mount(element);
    });

    return () => {
      /* Dashboard mounts an edit toolbar, it should be restored when leaving dashboard editing page */
      if (dashboardViewPath) {
        return;
      }
      portalNode.unmount();
      setHeaderActionMenu(undefined);
    };
  }, [
    portalNode,
    setHeaderActionMenu,
    theme,
    kibanaServiceI18n,
    dashboardViewPath,
    changesHistoryPath,
  ]);

  return (
    <InPortal node={portalNode}>
      <EuiHeaderSection side="right">
        {isDetectionsPath(pathname) && (
          <EuiHeaderSectionItem>
            <MlPopover />
          </EuiHeaderSectionItem>
        )}

        <EuiHeaderSectionItem>
          <EuiHeaderLinks>
            {canAddData && (
              <EuiHeaderLink
                color="primary"
                data-test-subj="add-data"
                href={href}
                iconType="indexOpen"
                onClick={onClick}
              >
                {BUTTON_ADD_DATA}
              </EuiHeaderLink>
            )}
            {showDataViewPicker && !showTimeline && (
              <DataViewPicker scope={pageScope} disabled={pageScope === PageScope.alerts} />
            )}
          </EuiHeaderLinks>
        </EuiHeaderSectionItem>
      </EuiHeaderSection>
    </InPortal>
  );
});
GlobalHeader.displayName = 'GlobalHeader';
