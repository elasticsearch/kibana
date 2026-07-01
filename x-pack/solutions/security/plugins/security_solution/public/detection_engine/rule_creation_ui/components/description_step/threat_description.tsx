/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiLink,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useEffect, useState } from 'react';
import type { BuildThreatDescription } from './types';
import type {
  MitreSubTechnique,
  MitreTactic,
  MitreTechnique,
} from '../../../../../common/detection_engine/mitre/types';
import ListTreeIcon from './assets/list_tree_icon.svg';
import * as i18n from './translations';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';

const lazyMitreConfiguration = () => {
  /**
   * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
   * See https://webpack.js.org/api/module-methods/#magic-comments
   */
  return import(
    /* webpackChunkName: "lazy_mitre_configuration" */
    '../../../../../common/detection_engine/mitre/mitre_tactics_techniques'
  );
};

const threatEuiFlexGroupStyles = css`
  .euiFlexItem {
    margin-bottom: 0;
  }
`;

const techniqueLinkItemStyles = css`
  .euiIcon {
    width: 8px;
    height: 8px;
  }

  align-self: flex-start;
`;

const UnsupportedMitreIdWarning = ({ id }: { id: string }) => (
  <EuiIconTip
    type="warning"
    color="warning"
    size="s"
    content={i18n.UNSUPPORTED_MITRE_ID_WARNING(id)}
    aria-label={i18n.UNSUPPORTED_MITRE_ID_WARNING(id)}
    iconProps={{ 'data-test-subj': `threatUnsupportedMitreIdWarning-${id}` }}
  />
);

export const ThreatEuiFlexGroup = ({
  threat,
  'data-test-subj': dataTestSubj = 'threat',
}: BuildThreatDescription) => {
  const { euiTheme } = useEuiTheme();
  const [techniquesOptions, setTechniquesOptions] = useState<MitreTechnique[]>([]);
  const [tacticsOptions, setTacticsOptions] = useState<MitreTactic[]>([]);
  const [subtechniquesOptions, setSubtechniquesOptions] = useState<MitreSubTechnique[]>([]);

  useEffect(() => {
    async function getMitre() {
      const mitreConfig = await lazyMitreConfiguration();
      setSubtechniquesOptions(mitreConfig.subtechniques);
      setTechniquesOptions(mitreConfig.techniques);
      setTacticsOptions(mitreConfig.tactics);
    }
    getMitre();
  }, []);

  const isMitreAttackUpdatesUIEnabled = useIsExperimentalFeatureEnabled(
    'mitreAttackUpdatesUIEnabled'
  );

  // Wait for the lazy MITRE dataset before deciding an id is unsupported, otherwise
  // every entry would briefly render a false-positive warning on mount. Also gated
  // on the feature flag so we don't surface any warnings when it's disabled.
  const showUnsupportedWarnings = isMitreAttackUpdatesUIEnabled && tacticsOptions.length > 0;

  return (
    <EuiFlexGroup direction="column" data-test-subj={dataTestSubj} css={threatEuiFlexGroupStyles}>
      {threat.map((singleThreat, index) => {
        const tactic = tacticsOptions.find((t) => t.id === singleThreat.tactic.id);
        const tacticUnsupported = showUnsupportedWarnings && tactic == null;
        return (
          <EuiFlexItem key={`${singleThreat.tactic.name}-${index}`}>
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false} wrap={false}>
              <EuiFlexItem grow={false}>
                <EuiLink
                  data-test-subj="threatTacticLink"
                  href={singleThreat.tactic.reference}
                  target="_blank"
                >
                  {tactic != null
                    ? tactic.label
                    : `${singleThreat.tactic.name} (${singleThreat.tactic.id})`}
                </EuiLink>
              </EuiFlexItem>
              {tacticUnsupported && (
                <EuiFlexItem grow={false}>
                  <UnsupportedMitreIdWarning id={singleThreat.tactic.id} />
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
            <EuiFlexGroup gutterSize="none" alignItems="flexStart" direction="column">
              {singleThreat.technique &&
                singleThreat.technique.map((technique, techniqueIndex) => {
                  const myTechnique = techniquesOptions.find((t) => t.id === technique.id);
                  const techniqueUnsupported = showUnsupportedWarnings && myTechnique == null;
                  return (
                    <EuiFlexItem key={myTechnique?.id ?? techniqueIndex}>
                      <EuiFlexGroup gutterSize="xs" responsive={false} wrap={false}>
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            data-test-subj="threatTechniqueLink"
                            href={technique.reference}
                            target="_blank"
                            iconType={ListTreeIcon}
                            size="xs"
                            css={techniqueLinkItemStyles}
                          >
                            {myTechnique != null
                              ? myTechnique.label
                              : `${technique.name} (${technique.id})`}
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                        {techniqueUnsupported && (
                          <EuiFlexItem grow={false}>
                            <UnsupportedMitreIdWarning id={technique.id} />
                          </EuiFlexItem>
                        )}
                      </EuiFlexGroup>
                      <EuiFlexGroup gutterSize="none" alignItems="flexStart" direction="column">
                        {technique.subtechnique != null &&
                          technique.subtechnique.map((subtechnique, subtechniqueIndex) => {
                            const mySubtechnique = subtechniquesOptions.find(
                              (t) => t.id === subtechnique.id
                            );
                            const subtechniqueUnsupported =
                              showUnsupportedWarnings && mySubtechnique == null;
                            return (
                              <EuiFlexItem
                                key={mySubtechnique?.id ?? subtechniqueIndex}
                                css={{ marginLeft: euiTheme.size.m }}
                              >
                                <EuiFlexGroup gutterSize="xs" responsive={false} wrap={false}>
                                  <EuiFlexItem grow={false}>
                                    <EuiButtonEmpty
                                      data-test-subj="threatSubtechniqueLink"
                                      href={subtechnique.reference}
                                      target="_blank"
                                      iconType={ListTreeIcon}
                                      size="xs"
                                      css={techniqueLinkItemStyles}
                                    >
                                      {mySubtechnique != null
                                        ? mySubtechnique.label
                                        : `${subtechnique.name} (${subtechnique.id})`}
                                    </EuiButtonEmpty>
                                  </EuiFlexItem>
                                  {subtechniqueUnsupported && (
                                    <EuiFlexItem grow={false}>
                                      <UnsupportedMitreIdWarning id={subtechnique.id} />
                                    </EuiFlexItem>
                                  )}
                                </EuiFlexGroup>
                              </EuiFlexItem>
                            );
                          })}
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  );
                })}
            </EuiFlexGroup>
          </EuiFlexItem>
        );
      })}
    </EuiFlexGroup>
  );
};
