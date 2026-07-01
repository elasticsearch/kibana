/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';

import type { DraggableProvidedDragHandleProps, UseEuiTheme } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiText,
  EuiToolTip,
  transparentize,
} from '@elastic/eui';
import { css } from '@emotion/react';

import { DASHBOARD_LINK_TYPE } from '../../../common/constants';
import type { ResolvedLink } from '../../types';
import { DashboardLinkStrings } from '../dashboard_link/dashboard_link_strings';
import { LinksStrings } from '../links_strings';
import { LinkInfo } from './constants';

export const LinksEditorSingleLink = ({
  link,
  editLink,
  deleteLink,
  dragHandleProps,
}: {
  editLink: () => void;
  deleteLink: () => void;
  link: ResolvedLink;
  dragHandleProps?: DraggableProvidedDragHandleProps;
}) => {
  const LinkLabel = useMemo(() => {
    const labelText = (
      <EuiFlexGroup tabIndex={0} gutterSize="s" responsive={false} wrap={false} alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiIcon
            type={link.error ? 'warning' : LinkInfo[link.type].icon}
            color={link.error ? 'warning' : 'text'}
            aria-label={
              link.error
                ? LinksStrings.editor.panelEditor.getBrokenDashboardLinkAriaLabel()
                : LinkInfo[link.type].type
            }
          />
        </EuiFlexItem>

        <EuiFlexItem className={'linksPanelEditorLinkText'}>
          <EuiText size="s" color={'default'} className="eui-textTruncate">
            {link.label || link.title}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );

    return () =>
      link.error ? (
        <EuiToolTip
          content={link.error.message}
          title={
            link.type === DASHBOARD_LINK_TYPE
              ? DashboardLinkStrings.getDashboardErrorLabel()
              : undefined // the messages thrown by an invalid URL are clear enough without an extra title
          }
        >
          {labelText}
        </EuiToolTip>
      ) : (
        labelText
      );
  }, [link]);

  return (
    <EuiPanel
      hasBorder
      css={styles}
      hasShadow={false}
      color={link.error ? 'warning' : 'plain'}
      className={`linksPanelEditorLink ${link.error ? 'linkError' : ''}`}
      data-test-subj={`panelEditorLink`}
    >
      <EuiFlexGroup gutterSize="s" responsive={false} wrap={false} alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiPanel
            color="transparent"
            paddingSize="none"
            {...dragHandleProps}
            aria-label={LinksStrings.editor.panelEditor.getDragHandleAriaLabel()}
            data-test-subj="panelEditorLink--dragHandle"
          >
            <EuiIcon type="dragVertical" aria-hidden={true} />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem className="linksPanelEditorLinkText">
          <LinkLabel />
        </EuiFlexItem>

        <EuiFlexGroup gutterSize="none" responsive={false} className="links_hoverActions">
          <EuiFlexItem>
            <EuiToolTip content={LinksStrings.editor.getEditLinkTitle()}>
              <EuiButtonIcon
                size="xs"
                iconType="pencil"
                onClick={editLink}
                aria-label={LinksStrings.editor.getEditLinkTitle(link.title)}
                data-test-subj="panelEditorLink--editBtn"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiToolTip content={LinksStrings.editor.getDeleteLinkTitle()}>
              <EuiButtonIcon
                size="xs"
                iconType="trash"
                aria-label={LinksStrings.editor.getDeleteLinkTitle(link.title)}
                color="danger"
                onClick={deleteLink}
                data-test-subj="panelEditorLink--deleteBtn"
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const styles = ({ euiTheme }: UseEuiTheme) =>
  css({
    padding: `${euiTheme.size.xs} ${euiTheme.size.s}`,
    color: euiTheme.colors.textParagraph,
    '.linksPanelEditorLinkText': {
      flex: 1,
      minWidth: 0,
    },
    '&.linkError': {
      border: `1px solid ${transparentize(euiTheme.colors.textWarning, 0.3)}`,
      color: euiTheme.colors.textWarning,
    },
    '& .links_hoverActions': {
      position: 'absolute',
      right: euiTheme.size.l,
      opacity: 0,
      visibility: 'hidden',
      transition: `visibility ${euiTheme.animation.normal}, opacity ${euiTheme.animation.normal}`,
    },
    '&:hover .links_hoverActions, &:focus-within .links_hoverActions ': {
      opacity: 1,
      visibility: 'visible',
    },
  });
