/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type ReactNode, useMemo } from 'react';
import styled from 'styled-components';
import { EuiThemeProvider, useEuiTheme, type EuiThemeComputed } from '@elastic/eui';
import { IS_DRAGGING_CLASS_NAME } from '@kbn/securitysolution-t-grid';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import type { KibanaPageTemplateProps } from '@kbn/shared-ux-page-kibana-template';
import { ExpandableFlyoutProvider } from '@kbn/expandable-flyout';
import { URL_PARAM_KEY } from '../../../common/hooks/use_url_state';
import { SecuritySolutionFlyout, TimelineFlyout } from '../../../flyout';
import { useSecuritySolutionNavigation } from '../../../common/components/navigation/use_security_solution_navigation';
import { TimelineId } from '../../../../common/types/timeline';
import { getTimelineShowStatusByIdSelector } from '../../../timelines/store/selectors';
import { useDeepEqualSelector } from '../../../common/hooks/use_selector';
import { GlobalKQLHeader } from './global_kql_header';
import { Timeline } from './timeline';
import { useShowTimeline } from '../../../common/utils/timeline/use_show_timeline';
import { useRouteSpy } from '../../../common/utils/route/use_route_spy';
import { SecurityPageName } from '../../types';

/**
 * Need to apply the styles via a className to effect the containing bottom bar
 * rather than applying them to the timeline bar directly
 */
const StyledKibanaPageTemplate = styled(KibanaPageTemplate)<
  Omit<KibanaPageTemplateProps, 'ref'> & {
    $isShowingTimelineOverlay?: boolean;
    $addBottomPadding?: boolean;
    theme: EuiThemeComputed; // using computed EUI theme to be consistent with user profile theming
  }
>`
  .kbnSolutionNav__sidebar:not(.kbnSolutionNav__sidebar--shrink) {
    background-color: ${({ theme }) => theme.colors.emptyShade};
  }

    .${IS_DRAGGING_CLASS_NAME} & {
      // When a drag is in process the bottom flyout should slide up to allow a drop
      transform: none;
    }
  }
`;

export type SecuritySolutionTemplateWrapperProps = Omit<KibanaPageTemplateProps, 'ref'> & {
  /**
   * Combined with isEmptyState, this prop allows complete override of the empty page
   */
  emptyPageBody?: ReactNode;
};

export const SecuritySolutionTemplateWrapper: React.FC<SecuritySolutionTemplateWrapperProps> =
  React.memo(({ children, ...rest }) => {
    const solutionNavProps = useSecuritySolutionNavigation();
    const [isTimelineBottomBarVisible] = useShowTimeline();
    const getTimelineShowStatus = useMemo(() => getTimelineShowStatusByIdSelector(), []);
    const { show: isShowingTimelineOverlay } = useDeepEqualSelector((state) =>
      getTimelineShowStatus(state, TimelineId.active)
    );
    const [routeProps] = useRouteSpy();
    const isPreview = routeProps?.pageName === SecurityPageName.rulesCreate;

    // The bottomBar by default has a set 'dark' colorMode that doesn't match the global colorMode from the Advanced Settings
    // To keep the mode in sync, we pass in the globalColorMode to the bottom bar here
    const { euiTheme, colorMode: globalColorMode } = useEuiTheme();

    // There is some logic in the StyledKibanaPageTemplate that checks for children presence, and we dont even need to render the children
    // solutionNavProps is momentarily initialized to undefined, this check prevents the children from being re-rendered in the initial load
    const renderChildren = !rest.isEmptyState && solutionNavProps !== undefined;

    /*
     * StyledKibanaPageTemplate is a styled EuiPageTemplate. Security solution currently passes the header
     * and page content as the children of StyledKibanaPageTemplate, as opposed to using the pageHeader prop,
     * which may account for any style discrepancies, such as the bottom border not extending the full width of the page,
     * between EuiPageTemplate and the security solution pages.
     */
    return (
      <StyledKibanaPageTemplate
        theme={euiTheme}
        $isShowingTimelineOverlay={isShowingTimelineOverlay}
        paddingSize="none"
        solutionNav={solutionNavProps ?? undefined}
        restrictWidth={false}
        {...rest}
      >
        {renderChildren && (
          <>
            <GlobalKQLHeader />
            <KibanaPageTemplate.Section
              className="securityPageWrapper"
              data-test-subj="pageContainer"
              paddingSize={rest.paddingSize ?? 'l'}
              alignment="top"
              component="div"
              grow={true}
            >
              <ExpandableFlyoutProvider urlKey={isPreview ? undefined : URL_PARAM_KEY.flyout}>
                {children}
                <SecuritySolutionFlyout />
              </ExpandableFlyoutProvider>
            </KibanaPageTemplate.Section>
            {isTimelineBottomBarVisible && (
              <KibanaPageTemplate.BottomBar data-test-subj="timeline-bottom-bar-container">
                <EuiThemeProvider colorMode={globalColorMode}>
                  <ExpandableFlyoutProvider urlKey={URL_PARAM_KEY.timelineFlyout}>
                    <Timeline />
                    <TimelineFlyout />
                  </ExpandableFlyoutProvider>
                </EuiThemeProvider>
              </KibanaPageTemplate.BottomBar>
            )}
          </>
        )}
      </StyledKibanaPageTemplate>
    );
  });

SecuritySolutionTemplateWrapper.displayName = 'SecuritySolutionTemplateWrapper';
