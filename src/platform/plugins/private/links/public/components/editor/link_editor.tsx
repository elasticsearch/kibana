/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import type { EuiRadioGroupOption } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFocusTrap,
  EuiForm,
  EuiFormRow,
  EuiIcon,
  EuiRadioGroup,
  EuiTitle,
} from '@elastic/eui';
import { DEFAULT_DASHBOARD_NAVIGATION_OPTIONS } from '@kbn/dashboard-navigation-options-common';
import { DashboardNavigationOptionsEditor } from '@kbn/dashboard-navigation-options-components';
import type { DashboardNavigationOptions } from '@kbn/dashboard-navigation-options-schema';

import {
  DASHBOARD_LINK_TYPE,
  DEFAULT_EXTERNAL_LINK_OPTIONS,
  EXTERNAL_LINK_TYPE,
} from '../../../common/constants';
import type { LinkType } from '../../../common/types';
import type { ExternalLinkOptions } from '../../../server';
import type { ResolvedLink } from '../../types';
import { ExternalLinkOptionsEditor } from '../external_link/external_link_options_editor';
import { LinksStrings } from '../links_strings';
import { LinkInfo } from './constants';
import { LinkDestination } from './link_destination';

export const LinkEditor = ({
  link,
  onSave,
  onClose,
  parentDashboardId,
}: {
  onClose: () => void;
  parentDashboardId?: string;
  link?: ResolvedLink; // will only be defined if **editing** a link; otherwise, creating a new link
  onSave: (newLink: ResolvedLink) => void;
}) => {
  const [selectedLinkType, setSelectedLinkType] = useState<LinkType>(
    link?.type ?? DASHBOARD_LINK_TYPE
  );
  const [defaultLinkLabel, setDefaultLinkLabel] = useState<string | undefined>(link?.title);
  const [currentLinkLabel, setCurrentLinkLabel] = useState<string>(link?.label ?? '');
  const [linkDescription, setLinkDescription] = useState<string | undefined>(link?.description);
  const [dashboardLinkOptions, setDashboardLinkOptions] = useState<DashboardNavigationOptions>({
    ...DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
    ...(link && link.type === DASHBOARD_LINK_TYPE ? link.options : {}),
  });
  const [externalLinkOptions, setExternalLinkOptions] = useState<ExternalLinkOptions>({
    ...DEFAULT_EXTERNAL_LINK_OPTIONS,
    ...(link && link.type === EXTERNAL_LINK_TYPE ? link.options : {}),
  });
  const [linkDestination, setLinkDestination] = useState<string | undefined>(link?.destination);

  const linkTypes: EuiRadioGroupOption[] = useMemo(() => {
    return ([DASHBOARD_LINK_TYPE, EXTERNAL_LINK_TYPE] as LinkType[]).map((type) => {
      return {
        id: type,
        label: (
          <EuiFlexGroup gutterSize="s" alignItems="center" aria-label={LinkInfo[type].description}>
            <EuiFlexItem grow={false}>
              <EuiIcon type={LinkInfo[type].icon} color="text" aria-hidden={true} />
            </EuiFlexItem>
            <EuiFlexItem>{LinkInfo[type].displayName}</EuiFlexItem>
          </EuiFlexGroup>
        ),
        'data-test-subj': `links--linkEditor--${type}--radioBtn`,
      };
    });
  }, []);

  /** When a new destination is picked, handle the logic for what to display as the current + default labels */
  const handleDestinationPicked = useCallback(
    (destination?: string, label?: string, description?: string) => {
      setLinkDestination(destination);
      if (!currentLinkLabel || defaultLinkLabel === currentLinkLabel) {
        setCurrentLinkLabel(label ?? '');
      }
      setDefaultLinkLabel(label);
      setLinkDescription(description);
    },
    [defaultLinkLabel, currentLinkLabel]
  );

  return (
    <EuiFocusTrap className={'linkEditor in'}>
      <EuiFlyoutHeader hasBorder>
        <EuiButtonEmpty
          className="linkEditorBackButton"
          flush="left"
          color="text"
          iconType={'chevronSingleLeft'}
          onClick={() => onClose()}
        >
          <EuiTitle size="s" aria-label={LinksStrings.editor.linkEditor.getGoBackAriaLabel()}>
            <h2>
              {link
                ? LinksStrings.editor.getEditLinkTitle()
                : LinksStrings.editor.getAddButtonLabel()}
            </h2>
          </EuiTitle>
        </EuiButtonEmpty>
      </EuiFlyoutHeader>
      <EuiFlyoutBody data-test-subj="links--linkEditor--flyout">
        <EuiForm component="form" fullWidth>
          <EuiFormRow label={LinksStrings.editor.linkEditor.getLinkTypePickerLabel()}>
            <EuiRadioGroup
              compressed
              options={linkTypes}
              idSelected={selectedLinkType}
              onChange={(id) => {
                if (currentLinkLabel === defaultLinkLabel) {
                  setCurrentLinkLabel(link?.type === id ? link.label ?? '' : '');
                }
                setSelectedLinkType(id as LinkType);
              }}
              name="linkType"
            />
          </EuiFormRow>
          <LinkDestination
            link={link}
            parentDashboardId={parentDashboardId}
            selectedLinkType={selectedLinkType}
            setDestination={handleDestinationPicked}
          />
          <EuiFormRow label={LinksStrings.editor.linkEditor.getLinkTextLabel()}>
            <EuiFieldText
              compressed
              placeholder={
                (linkDestination ? defaultLinkLabel : '') ||
                LinksStrings.editor.linkEditor.getLinkTextPlaceholder()
              }
              value={currentLinkLabel}
              onChange={(e) => setCurrentLinkLabel(e.target.value)}
              data-test-subj="links--linkEditor--linkLabel--input"
            />
          </EuiFormRow>
          <EuiFormRow label={LinksStrings.editor.linkEditor.getLinkOptionsLabel()}>
            {selectedLinkType === DASHBOARD_LINK_TYPE ? (
              <DashboardNavigationOptionsEditor
                options={dashboardLinkOptions}
                onOptionChange={(change) => {
                  setDashboardLinkOptions({ ...dashboardLinkOptions, ...change });
                }}
              />
            ) : (
              <ExternalLinkOptionsEditor
                options={externalLinkOptions}
                onOptionChange={(change) => {
                  setExternalLinkOptions({ ...externalLinkOptions, ...change });
                }}
              />
            )}
          </EuiFormRow>
        </EuiForm>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup responsive={false} justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              flush="left"
              onClick={() => onClose()}
              data-test-subj="links--linkEditor--closeBtn"
            >
              {LinksStrings.editor.getCancelButtonLabel()}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              disabled={!linkDestination}
              onClick={() => {
                // this check should always be true, since the button is disabled otherwise - this is just for type safety
                if (linkDestination) {
                  function getOptions() {
                    if (selectedLinkType === DASHBOARD_LINK_TYPE) {
                      return dashboardLinkOptions;
                    }

                    if (selectedLinkType === EXTERNAL_LINK_TYPE) {
                      return externalLinkOptions;
                    }

                    throw new Error(`unexpected options type: ${selectedLinkType}`);
                  }
                  onSave({
                    label: currentLinkLabel === defaultLinkLabel ? undefined : currentLinkLabel,
                    type: selectedLinkType,
                    id: link?.id ?? uuidv4(),
                    destination: linkDestination,
                    options: getOptions(),
                    title: defaultLinkLabel ?? '',
                    description: linkDescription,
                  } as ResolvedLink);

                  onClose();
                }
              }}
              data-test-subj="links--linkEditor--saveBtn"
            >
              {link
                ? LinksStrings.editor.getUpdateButtonLabel()
                : LinksStrings.editor.getAddButtonLabel()}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFocusTrap>
  );
};
