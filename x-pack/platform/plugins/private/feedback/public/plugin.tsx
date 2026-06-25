/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { lazy, Suspense } from 'react';
import { EuiModal } from '@elastic/eui';
import { css } from '@emotion/react';
import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type { CloudSetup, CloudStart } from '@kbn/cloud-plugin/public';
import type { TelemetryPluginStart } from '@kbn/telemetry-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { FeedbackRegistryEntry } from '@kbn/ui-feedback';
import { isNextChrome } from '@kbn/core-chrome-feature-flags';
import { toMountPoint } from '@kbn/react-kibana-mount';
import { i18n } from '@kbn/i18n';
import { firstValueFrom, type Subscription } from 'rxjs';
import type { FeedbackFormData } from '../common';
import { getAppDetails } from './src/utils';

interface FeedbackPluginSetupDependencies {
  cloud?: CloudSetup;
}

interface FeedbackPluginStartDependencies {
  telemetry: TelemetryPluginStart;
  cloud?: CloudStart;
  spaces?: SpacesPluginStart;
}

interface FeedbackDeps {
  getQuestions: (appId: string) => Promise<FeedbackRegistryEntry[]>;
  getAppDetails: () => { title: string; id: string; url: string };
  getCurrentUserEmail: () => Promise<string | undefined>;
  sendFeedback: (data: FeedbackFormData) => Promise<void>;
  showToast: (title: string, color: 'success' | 'error') => void;
}

const LazyFeedbackTriggerButton = lazy(() =>
  import('@kbn/ui-feedback').then(({ FeedbackTriggerButton }) => ({
    default: FeedbackTriggerButton,
  }))
);

const LazyFeedbackContainer = lazy(() =>
  import('@kbn/ui-feedback').then(({ FeedbackContainer }) => ({
    default: FeedbackContainer,
  }))
);

const feedbackModalCss = css`
  overflow-y: auto;
`;

const createFeedbackDeps = (
  core: CoreStart,
  organizationId: string | undefined,
  cloud?: CloudStart,
  spaces?: SpacesPluginStart
): FeedbackDeps => {
  const getSolution = async (): Promise<string> => {
    try {
      const space = await spaces?.getActiveSpace();
      return space?.solution || cloud?.serverless?.projectType || 'classic';
    } catch {
      return cloud?.serverless?.projectType || 'classic';
    }
  };

  return {
    getAppDetails: () => getAppDetails(core),
    getQuestions: async (appId: string) => {
      const { getFeedbackQuestionsForApp } = await import('@kbn/feedback-registry');
      return getFeedbackQuestionsForApp(appId);
    },
    getCurrentUserEmail: async () => {
      if (!core.security) return undefined;
      try {
        const user = await core.security.authc.getCurrentUser();
        return user?.email;
      } catch {
        return;
      }
    },
    sendFeedback: async (data: FeedbackFormData) => {
      const solution = await getSolution();
      await core.http.post('/internal/feedback/send', {
        body: JSON.stringify({ ...data, solution, organization_id: organizationId }),
      });
    },
    showToast: (title: string, color: 'success' | 'error') => {
      if (color === 'success') {
        core.notifications.toasts.addSuccess({ title });
      }
      if (color === 'error') {
        core.notifications.toasts.addDanger({ title });
      }
    },
  };
};

const openFeedbackModal = (core: CoreStart, deps: FeedbackDeps) => {
  const modal = core.overlays.openModal(
    toMountPoint(
      core.rendering.addContext(
        <EuiModal
          onClose={() => modal.close()}
          aria-label={i18n.translate('feedback.modal.ariaLabel', {
            defaultMessage: 'Feedback form',
          })}
          css={feedbackModalCss}
        >
          <Suspense fallback={null}>
            <LazyFeedbackContainer
              getQuestions={deps.getQuestions}
              getAppDetails={deps.getAppDetails}
              getCurrentUserEmail={deps.getCurrentUserEmail}
              sendFeedback={deps.sendFeedback}
              showToast={deps.showToast}
              hideFeedbackContainer={() => modal.close()}
            />
          </Suspense>
        </EuiModal>
      ),
      core
    )
  );
};

export class FeedbackPlugin implements Plugin {
  private organizationId?: string;
  private telemetryOptInSubscription?: Subscription;

  public setup(_core: CoreSetup, { cloud }: FeedbackPluginSetupDependencies) {
    this.organizationId = cloud?.organizationId;
    return {};
  }

  public start(core: CoreStart, { cloud, telemetry, spaces }: FeedbackPluginStartDependencies) {
    if (!core.notifications.feedback.isEnabled()) {
      return {};
    }

    const deps = createFeedbackDeps(core, this.organizationId, cloud, spaces);
    const { isOptedIn$ } = telemetry.telemetryService;
    const checkTelemetryOptIn = () => firstValueFrom(isOptedIn$);

    if (isNextChrome(core.featureFlags)) {
      let unregisterFeedbackHandler: (() => void) | undefined;

      this.telemetryOptInSubscription = isOptedIn$.subscribe((optIn) => {
        unregisterFeedbackHandler?.();
        unregisterFeedbackHandler = undefined;

        if (optIn) {
          unregisterFeedbackHandler = core.chrome.next.registerFeedbackHandler(() => {
            openFeedbackModal(core, deps);
          });
        }
      });
    }

    core.chrome.navControls.registerRight({
      order: 1001,
      content: (
        <Suspense fallback={null}>
          <LazyFeedbackTriggerButton {...deps} checkTelemetryOptIn={checkTelemetryOptIn} />
        </Suspense>
      ),
    });

    return {};
  }

  public stop() {
    this.telemetryOptInSubscription?.unsubscribe();
    this.telemetryOptInSubscription = undefined;
  }
}
