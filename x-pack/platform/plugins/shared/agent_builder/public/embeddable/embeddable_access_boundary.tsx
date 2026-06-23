/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  EuiButtonIcon,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { PROMPT_LAYOUT_VARIANTS } from '../application/components/common/prompt/layout';
import { useAgentBuilderServices } from '../application/hooks/use_agent_builder_service';
import { useUiPrivileges } from '../application/hooks/use_ui_privileges';
import { UpgradeLicensePrompt } from '../application/components/access/prompts/upgrade_license_prompt';
import { AddLlmConnectionPrompt } from '../application/components/access/prompts/add_llm_connection_prompt';
import { NoPrivilegePrompt } from '../application/components/access/prompts/no_privilege_prompt';

const closeButtonLabel = i18n.translate(
  'xpack.agentBuilder.embeddable.accessBoundary.closeButton',
  {
    defaultMessage: 'Close',
  }
);

interface AccessDeniedWrapperProps {
  children: ReactNode;
  onClose?: () => void;
}

const AccessDeniedWrapper: React.FC<AccessDeniedWrapperProps> = ({ children, onClose }) => {
  const { euiTheme } = useEuiTheme();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!closeButtonRef.current) return;

    const timeoutId = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  const headerHeight = `calc(${euiTheme.size.xl} * 2)`;
  const headerStyles = css`
    display: flex;
    justify-content: flex-end;
    height: ${headerHeight};
    &.euiFlyoutHeader {
      padding: ${euiTheme.size.base};
    }
  `;

  const bodyStyles = css`
    flex: 1;
    min-height: 0;
    .euiFlyoutBody__overflowContent {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
  `;

  return (
    <>
      <EuiFlyoutHeader css={headerStyles}>
        {onClose && (
          <EuiToolTip content={closeButtonLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              buttonRef={closeButtonRef}
              iconType="cross"
              aria-label={closeButtonLabel}
              onClick={onClose}
              data-test-subj="embeddableAccessBoundaryCloseButton"
            />
          </EuiToolTip>
        )}
      </EuiFlyoutHeader>
      <EuiFlyoutBody css={bodyStyles}>{children}</EuiFlyoutBody>
    </>
  );
};

export interface EmbeddableAccessBoundaryProps {
  children: ReactNode;
  onClose?: () => void;
}

interface AccessState {
  isLoading: boolean;
  hasRequiredLicense: boolean;
  hasLlmConnector: boolean;
}

export const EmbeddableAccessBoundary: React.FC<EmbeddableAccessBoundaryProps> = ({
  children,
  onClose,
}) => {
  const { accessChecker } = useAgentBuilderServices();
  const { show: hasShowPrivilege } = useUiPrivileges();

  const [accessState, setAccessState] = useState<AccessState>({
    isLoading: true,
    hasRequiredLicense: false,
    hasLlmConnector: false,
  });

  useEffect(() => {
    const checkAccess = async () => {
      try {
        await accessChecker.initAccess();
        const { hasRequiredLicense, hasLlmConnector } = accessChecker.getAccess();

        setAccessState({
          isLoading: false,
          hasRequiredLicense,
          hasLlmConnector,
        });
      } catch (error) {
        setAccessState({
          isLoading: false,
          hasRequiredLicense: false,
          hasLlmConnector: false,
        });
      }
    };

    checkAccess();
  }, [accessChecker]);

  if (accessState.isLoading) {
    return (
      <AccessDeniedWrapper onClose={onClose}>
        <EuiLoadingSpinner size="xl" />
      </AccessDeniedWrapper>
    );
  }

  if (!accessState.hasRequiredLicense) {
    return (
      <AccessDeniedWrapper onClose={onClose}>
        <UpgradeLicensePrompt variant={PROMPT_LAYOUT_VARIANTS.EMBEDDABLE} />
      </AccessDeniedWrapper>
    );
  }

  if (!hasShowPrivilege) {
    return (
      <AccessDeniedWrapper onClose={onClose}>
        <NoPrivilegePrompt variant={PROMPT_LAYOUT_VARIANTS.EMBEDDABLE} />
      </AccessDeniedWrapper>
    );
  }

  if (!accessState.hasLlmConnector) {
    return (
      <AccessDeniedWrapper onClose={onClose}>
        <AddLlmConnectionPrompt variant={PROMPT_LAYOUT_VARIANTS.EMBEDDABLE} />
      </AccessDeniedWrapper>
    );
  }

  return children;
};
