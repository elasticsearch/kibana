/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiButtonEmpty, EuiButtonIcon } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiLink, EuiToolTip } from '@elastic/eui';
import { isEmpty, isString } from 'lodash/fp';
import type { SyntheticEvent } from 'react';
import React, { useCallback, useContext, useMemo } from 'react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { getEmptyTagValue } from '../../../../../common/components/empty_value';
import { getRuleDetailsUrl } from '../../../../../common/components/link_to/redirect_to_detection_engine';
import { TruncatableText } from '../../../../../common/components/truncatable_text';
import { isUrlInvalid } from '../../../../../common/utils/validators';
import endPointSvg from '../../../../../common/utils/logo_endpoint/64_color.svg';
import * as i18n from './translations';
import { SecurityPageName } from '../../../../../app/types';
import { useFormatUrl } from '../../../../../common/components/link_to';
import { useKibana } from '../../../../../common/lib/kibana';
import { APP_UI_ID } from '../../../../../../common/constants';
import { LinkAnchor } from '../../../../../common/components/links';
import { GenericLinkButton } from '../../../../../common/components/links/helpers';
import { StatefulEventContext } from '../../../../../common/components/events_viewer/stateful_event_context';
import { RulePanelKey } from '../../../../../flyout/rule_details/right';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import { RuleDetails } from '../../../../../flyout_v2/rule/main';
import { flyoutProviders } from '../../../../../flyout_v2/shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../../../../flyout_v2/shared/hooks/use_default_flyout_properties';

interface RenderRuleNameProps {
  children?: React.ReactNode;
  Component?: typeof EuiButtonEmpty | typeof EuiButtonIcon;
  fieldName: string;
  isButton?: boolean;
  onClick?: () => void;
  linkValue: string | null | undefined;
  openInNewTab?: boolean;
  truncate?: boolean;
  title?: string;
  value: string | number | null | undefined;
}

export const RenderRuleName: React.FC<RenderRuleNameProps> = ({
  children,
  Component,
  fieldName,
  isButton,
  onClick,
  linkValue,
  openInNewTab = false,
  truncate,
  title,
  value,
}) => {
  const { openFlyout } = useExpandableFlyoutApi();
  const { services } = useKibana();
  const { overlays, application } = services;
  const store = useStore();
  const history = useHistory();
  const eventContext = useContext(StatefulEventContext);
  const newFlyoutSystemEnabled = useIsExperimentalFeatureEnabled('newFlyoutSystemEnabled');
  const defaultDocumentFlyoutProperties = useDefaultDocumentFlyoutProperties();

  const ruleName = `${value}`;
  const ruleId = linkValue;
  const { search } = useFormatUrl(SecurityPageName.rules);
  const { navigateToApp, getUrlForApp } = application;
  const canReadRules = useUserPrivileges().rulesPrivileges.rules.read;

  const isInTimelineContext =
    ruleName && eventContext?.enableHostDetailsFlyout && eventContext?.timelineID;

  const goToRuleDetails = useCallback(
    (ev: React.SyntheticEvent) => {
      ev.preventDefault();

      if (!eventContext || !isInTimelineContext) {
        navigateToApp(APP_UI_ID, {
          deepLinkId: SecurityPageName.rules,
          path: getRuleDetailsUrl(ruleId ?? '', search),
          openInNewTab,
        });
        return;
      }

      if (newFlyoutSystemEnabled && ruleId) {
        overlays.openSystemFlyout(
          flyoutProviders({
            services,
            store,
            history,
            children: <RuleDetails ruleId={ruleId} />,
          }),
          {
            ...defaultDocumentFlyoutProperties,
            session: 'inherit',
          }
        );
        return;
      }

      openFlyout({
        right: {
          id: RulePanelKey,
          params: {
            ruleId,
          },
        },
      });
    },
    [
      navigateToApp,
      ruleId,
      search,
      openInNewTab,
      openFlyout,
      eventContext,
      isInTimelineContext,
      newFlyoutSystemEnabled,
      overlays,
      services,
      store,
      history,
      defaultDocumentFlyoutProperties,
    ]
  );

  const href = useMemo(
    () =>
      getUrlForApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.rules,
        path: getRuleDetailsUrl(ruleId ?? '', search),
      }),
    [getUrlForApp, ruleId, search]
  );
  const link = useMemo(() => {
    const content = truncate ? (
      <TruncatableText dataTestSubj={`formatted-field-${fieldName}`}>{value}</TruncatableText>
    ) : (
      value
    );
    if (isButton) {
      return (
        <GenericLinkButton
          Component={Component}
          dataTestSubj="data-grid-host-details"
          href={href}
          iconType="maximize"
          onClick={onClick ?? goToRuleDetails}
          title={title ?? ruleName}
        >
          {children}
        </GenericLinkButton>
      );
    } else if (Component) {
      return (
        <Component
          aria-label={title}
          data-test-subj={`view-${fieldName}`}
          iconType="link"
          onClick={goToRuleDetails}
          title={title}
        >
          {title ?? value}
        </Component>
      );
    } else if (openInNewTab) {
      return (
        <LinkAnchor
          onClick={goToRuleDetails}
          href={href}
          data-test-subj="goToRuleDetails"
          target="_blank"
          external={false}
        >
          {children ?? content}
        </LinkAnchor>
      );
    } else {
      return (
        <LinkAnchor onClick={goToRuleDetails} href={href} data-test-subj="ruleName">
          {children ?? content}
        </LinkAnchor>
      );
    }
  }, [
    Component,
    children,
    fieldName,
    goToRuleDetails,
    href,
    isButton,
    onClick,
    ruleName,
    title,
    truncate,
    value,
    openInNewTab,
  ]);

  const shouldShowLink = canReadRules && isString(value) && ruleName.length > 0 && ruleId != null;

  if (shouldShowLink) {
    return link;
  } else if (value != null) {
    return <span data-test-subj="ruleName">{value}</span>;
  }

  return getEmptyTagValue();
};

const canYouAddEndpointLogo = (moduleName: string, endpointUrl: string | null | undefined) =>
  moduleName.trim().toLocaleLowerCase() === 'endgame' &&
  endpointUrl != null &&
  !isEmpty(endpointUrl) &&
  !isUrlInvalid(endpointUrl) &&
  endpointUrl.includes('/alerts/');

export const renderEventModule = ({
  linkValue,
  truncate,
  value,
}: {
  linkValue: string | null | undefined;
  truncate?: boolean;
  value: string | number | null | undefined;
}) => {
  const moduleName = `${value}`;
  const endpointRefUrl = linkValue;

  const content = truncate ? <TruncatableText>{value}</TruncatableText> : value;

  return isString(value) && moduleName.length > 0 ? (
    <EuiFlexGroup
      gutterSize="none"
      alignItems="center"
      justifyContent={
        endpointRefUrl != null && !isEmpty(endpointRefUrl) ? 'flexStart' : 'spaceBetween'
      }
    >
      <EuiFlexItem css={{ width: '100%' }}>{content}</EuiFlexItem>
      {endpointRefUrl != null && canYouAddEndpointLogo(moduleName, endpointRefUrl) && (
        <EuiFlexItem grow={false}>
          <EuiToolTip
            data-test-subj="event-module-link-to-elastic-endpoint-security"
            content={
              <>
                <p>{i18n.LINK_ELASTIC_ENDPOINT_SECURITY}</p>
                <p>{endpointRefUrl}</p>
              </>
            }
          >
            <EuiLink href={endpointRefUrl} target="_blank">
              <EuiIcon type={endPointSvg} size="m" aria-hidden={true} />
            </EuiLink>
          </EuiToolTip>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  ) : (
    getEmptyTagValue()
  );
};

const GenericLinkComponent: React.FC<{
  children?: React.ReactNode;
  /** `Component` is only used with `EuiDataGrid`; the grid keeps a reference to `Component` for show / hide functionality */
  Component?: typeof EuiButtonEmpty | typeof EuiButtonIcon;
  dataTestSubj?: string;
  href: string;
  onClick?: (e: SyntheticEvent) => void;
  title?: string;
  iconType?: string;
}> = ({ children, Component, dataTestSubj, href, onClick, title, iconType = 'link' }) => {
  return Component ? (
    <Component
      data-test-subj={dataTestSubj}
      href={href}
      iconType={iconType}
      onClick={onClick}
      title={title}
    >
      {title ?? children}
    </Component>
  ) : (
    <EuiLink data-test-subj={dataTestSubj} target="_blank" href={href}>
      {title ?? children}
    </EuiLink>
  );
};

const GenericLink = React.memo(GenericLinkComponent);

export const renderUrl = ({
  Component,
  truncate,
  title,
  value,
}: {
  /** `Component` is only used with `EuiDataGrid`; the grid keeps a reference to `Component` for show / hide functionality */
  Component?: typeof EuiButtonEmpty | typeof EuiButtonIcon;
  truncate?: boolean;
  title?: string;
  value: string | number | null | undefined;
}) => {
  const urlName = `${value}`;
  const isUrlValid = !isUrlInvalid(urlName);

  const formattedValue = truncate ? <TruncatableText>{value}</TruncatableText> : value;
  const content = isUrlValid ? (
    <GenericLink
      Component={Component}
      href={urlName}
      dataTestSubj="ata-grid-url"
      title={title}
      iconType="link"
    />
  ) : (
    <>{formattedValue}</>
  );

  return isString(value) && urlName.length > 0 ? content : getEmptyTagValue();
};
