/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiButton,
  EuiButtonIcon,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiSuperSelect,
  EuiTextArea,
} from '@elastic/eui';
import { kebabCase } from 'lodash/fp';
import type { RuleParams } from '@kbn/alerting-v2-schemas';
import type {
  MitreTactic,
  MitreTechnique,
  MitreSubTechnique,
} from '../../../common/detection_engine/mitre/types';
import * as i18n from '../translations';

const lazyMitreConfiguration = () =>
  import(
    /* webpackChunkName: "lazy_mitre_configuration" */
    '../../../common/detection_engine/mitre/mitre_tactics_techniques'
  );

type ThreatEntry = NonNullable<RuleParams['threat']>[number];
type RelatedIntegration = NonNullable<RuleParams['related_integrations']>[number];

const NONE_ENTRY = { id: 'none', name: 'none', reference: 'none' };

interface SecurityDetectionFieldsProps {
  threat: ThreatEntry[];
  onThreatChange: (threat: ThreatEntry[]) => void;
  note: string;
  onNoteChange: (note: string) => void;
  setup: string;
  onSetupChange: (setup: string) => void;
  relatedIntegrations: RelatedIntegration[];
  onRelatedIntegrationsChange: (integrations: RelatedIntegration[]) => void;
  investigationFieldNames: string[];
  onInvestigationFieldNamesChange: (fieldNames: string[]) => void;
  references: string[];
  onReferencesChange: (references: string[]) => void;
}

export const SecurityDetectionFields: React.FC<SecurityDetectionFieldsProps> = ({
  threat,
  onThreatChange,
  note,
  onNoteChange,
  setup,
  onSetupChange,
  relatedIntegrations,
  onRelatedIntegrationsChange,
  investigationFieldNames,
  onInvestigationFieldNamesChange,
  references,
  onReferencesChange,
}) => {
  const [tacticsOptions, setTacticsOptions] = useState<MitreTactic[]>([]);
  const [techniquesOptions, setTechniquesOptions] = useState<MitreTechnique[]>([]);
  const [subtechniquesOptions, setSubtechniquesOptions] = useState<MitreSubTechnique[]>([]);

  useEffect(() => {
    let cancelled = false;
    lazyMitreConfiguration().then((cfg) => {
      if (!cancelled) {
        setTacticsOptions(cfg.tactics);
        setTechniquesOptions(cfg.techniques);
        setSubtechniquesOptions(cfg.subtechniques);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const addTactic = useCallback(() => {
    onThreatChange([
      ...threat,
      { framework: 'MITRE ATT&CK', tactic: { ...NONE_ENTRY }, technique: [] },
    ]);
  }, [threat, onThreatChange]);

  const removeTactic = useCallback(
    (index: number) => {
      const updated = threat.filter((_, i) => i !== index);
      onThreatChange(updated);
    },
    [threat, onThreatChange]
  );

  const updateTactic = useCallback(
    (threatIdx: number, tacticValue: string) => {
      const tactic = tacticsOptions.find((t) => t.value === tacticValue);
      if (!tactic) return;
      const updated = [...threat];
      updated[threatIdx] = {
        ...updated[threatIdx],
        tactic: { id: tactic.id, name: tactic.name, reference: tactic.reference },
        technique: [],
      };
      onThreatChange(updated);
    },
    [threat, onThreatChange, tacticsOptions]
  );

  const addTechnique = useCallback(
    (threatIdx: number) => {
      const updated = [...threat];
      updated[threatIdx] = {
        ...updated[threatIdx],
        technique: [...(updated[threatIdx].technique ?? []), { ...NONE_ENTRY, subtechnique: [] }],
      };
      onThreatChange(updated);
    },
    [threat, onThreatChange]
  );

  const removeTechnique = useCallback(
    (threatIdx: number, techIdx: number) => {
      const updated = [...threat];
      const techniques = [...(updated[threatIdx].technique ?? [])];
      techniques.splice(techIdx, 1);
      updated[threatIdx] = { ...updated[threatIdx], technique: techniques };
      onThreatChange(updated);
    },
    [threat, onThreatChange]
  );

  const updateTechnique = useCallback(
    (threatIdx: number, techIdx: number, techId: string) => {
      const tech = techniquesOptions.find((t) => t.id === techId);
      if (!tech) return;
      const updated = [...threat];
      const techniques = [...(updated[threatIdx].technique ?? [])];
      techniques[techIdx] = {
        id: tech.id,
        name: tech.name,
        reference: tech.reference,
        subtechnique: [],
      };
      updated[threatIdx] = { ...updated[threatIdx], technique: techniques };
      onThreatChange(updated);
    },
    [threat, onThreatChange, techniquesOptions]
  );

  const addSubtechnique = useCallback(
    (threatIdx: number, techIdx: number) => {
      const updated = [...threat];
      const techniques = [...(updated[threatIdx].technique ?? [])];
      const subs = [...(techniques[techIdx].subtechnique ?? [])];
      subs.push({ ...NONE_ENTRY });
      techniques[techIdx] = { ...techniques[techIdx], subtechnique: subs };
      updated[threatIdx] = { ...updated[threatIdx], technique: techniques };
      onThreatChange(updated);
    },
    [threat, onThreatChange]
  );

  const removeSubtechnique = useCallback(
    (threatIdx: number, techIdx: number, subIdx: number) => {
      const updated = [...threat];
      const techniques = [...(updated[threatIdx].technique ?? [])];
      const subs = [...(techniques[techIdx].subtechnique ?? [])];
      subs.splice(subIdx, 1);
      techniques[techIdx] = { ...techniques[techIdx], subtechnique: subs };
      updated[threatIdx] = { ...updated[threatIdx], technique: techniques };
      onThreatChange(updated);
    },
    [threat, onThreatChange]
  );

  const updateSubtechnique = useCallback(
    (threatIdx: number, techIdx: number, subIdx: number, subId: string) => {
      const sub = subtechniquesOptions.find((s) => s.id === subId);
      if (!sub) return;
      const updated = [...threat];
      const techniques = [...(updated[threatIdx].technique ?? [])];
      const subs = [...(techniques[techIdx].subtechnique ?? [])];
      subs[subIdx] = { id: sub.id, name: sub.name, reference: sub.reference };
      techniques[techIdx] = { ...techniques[techIdx], subtechnique: subs };
      updated[threatIdx] = { ...updated[threatIdx], technique: techniques };
      onThreatChange(updated);
    },
    [threat, onThreatChange, subtechniquesOptions]
  );

  const handleReferenceChange = useCallback(
    (index: number, value: string) => {
      const updated = [...references];
      updated[index] = value;
      onReferencesChange(updated);
    },
    [references, onReferencesChange]
  );

  const handleAddReference = useCallback(() => {
    onReferencesChange([...references, '']);
  }, [references, onReferencesChange]);

  const handleRemoveReference = useCallback(
    (index: number) => {
      onReferencesChange(references.filter((_, i) => i !== index));
    },
    [references, onReferencesChange]
  );

  const handleIntegrationChange = useCallback(
    (index: number, field: keyof RelatedIntegration, value: string) => {
      const updated = [...relatedIntegrations];
      updated[index] = { ...updated[index], [field]: value };
      onRelatedIntegrationsChange(updated);
    },
    [relatedIntegrations, onRelatedIntegrationsChange]
  );

  const handleAddIntegration = useCallback(() => {
    onRelatedIntegrationsChange([
      ...relatedIntegrations,
      { package: '', version: '', integration: '' },
    ]);
  }, [relatedIntegrations, onRelatedIntegrationsChange]);

  const handleRemoveIntegration = useCallback(
    (index: number) => {
      onRelatedIntegrationsChange(relatedIntegrations.filter((_, i) => i !== index));
    },
    [relatedIntegrations, onRelatedIntegrationsChange]
  );

  return (
    <EuiAccordion
      id="securityDetectionFieldsAccordion"
      buttonContent={i18n.DETECTION_FIELDS_ACCORDION}
      data-test-subj="securityDetectionFieldsAccordion"
    >
      <EuiSpacer size="m" />

      <EuiFormRow label={i18n.NOTE_LABEL} helpText={i18n.NOTE_HELP} fullWidth>
        <EuiTextArea
          fullWidth
          rows={4}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          data-test-subj="securityDetectionNote"
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiFormRow label={i18n.SETUP_LABEL} helpText={i18n.SETUP_HELP} fullWidth>
        <EuiTextArea
          fullWidth
          rows={4}
          value={setup}
          onChange={(e) => onSetupChange(e.target.value)}
          data-test-subj="securityDetectionSetup"
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiFormRow label={i18n.REFERENCES_LABEL} helpText={i18n.REFERENCES_HELP} fullWidth>
        <div>
          {references.map((ref, idx) => (
            <EuiFlexGroup key={idx} gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem>
                <EuiFieldText
                  value={ref}
                  onChange={(e) => handleReferenceChange(idx, e.target.value)}
                  placeholder="https://"
                  data-test-subj={`securityDetectionReference-${idx}`}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  iconType="trash"
                  color="danger"
                  aria-label="Remove reference"
                  onClick={() => handleRemoveReference(idx)}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          ))}
          <EuiSpacer size="xs" />
          <EuiButton size="s" iconType="plusInCircle" onClick={handleAddReference}>
            {i18n.ADD_REFERENCE}
          </EuiButton>
        </div>
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiFormRow
        label={i18n.INVESTIGATION_FIELDS_LABEL}
        helpText={i18n.INVESTIGATION_FIELDS_HELP}
        fullWidth
      >
        <EuiComboBox
          fullWidth
          noSuggestions
          selectedOptions={investigationFieldNames.map((f) => ({ label: f }))}
          onChange={(opts) => onInvestigationFieldNamesChange(opts.map((o) => o.label))}
          onCreateOption={(val) => {
            if (val.trim()) {
              onInvestigationFieldNamesChange([...investigationFieldNames, val.trim()]);
            }
          }}
          data-test-subj="securityDetectionInvestigationFields"
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiFormRow
        label={i18n.RELATED_INTEGRATIONS_LABEL}
        helpText={i18n.RELATED_INTEGRATIONS_HELP}
        fullWidth
      >
        <div>
          {relatedIntegrations.map((integration, idx) => (
            <React.Fragment key={idx}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem>
                  <EuiFieldText
                    placeholder="package"
                    value={integration.package}
                    onChange={(e) => handleIntegrationChange(idx, 'package', e.target.value)}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFieldText
                    placeholder="version"
                    value={integration.version}
                    onChange={(e) => handleIntegrationChange(idx, 'version', e.target.value)}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFieldText
                    placeholder="integration (optional)"
                    value={integration.integration ?? ''}
                    onChange={(e) => handleIntegrationChange(idx, 'integration', e.target.value)}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonIcon
                    iconType="trash"
                    color="danger"
                    aria-label="Remove integration"
                    onClick={() => handleRemoveIntegration(idx)}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="xs" />
            </React.Fragment>
          ))}
          <EuiButton size="s" iconType="plusInCircle" onClick={handleAddIntegration}>
            {i18n.ADD_INTEGRATION}
          </EuiButton>
        </div>
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiFormRow label={i18n.THREAT_LABEL} fullWidth>
        <div>
          {threat.map((entry, threatIdx) => (
            <ThreatEntryRow
              key={threatIdx}
              entry={entry}
              threatIdx={threatIdx}
              tacticsOptions={tacticsOptions}
              techniquesOptions={techniquesOptions}
              subtechniquesOptions={subtechniquesOptions}
              onUpdateTactic={updateTactic}
              onRemoveTactic={removeTactic}
              onAddTechnique={addTechnique}
              onRemoveTechnique={removeTechnique}
              onUpdateTechnique={updateTechnique}
              onAddSubtechnique={addSubtechnique}
              onRemoveSubtechnique={removeSubtechnique}
              onUpdateSubtechnique={updateSubtechnique}
            />
          ))}
          <EuiSpacer size="s" />
          <EuiButton size="s" iconType="plusInCircle" onClick={addTactic}>
            {i18n.ADD_TACTIC}
          </EuiButton>
        </div>
      </EuiFormRow>
    </EuiAccordion>
  );
};

interface ThreatEntryRowProps {
  entry: ThreatEntry;
  threatIdx: number;
  tacticsOptions: MitreTactic[];
  techniquesOptions: MitreTechnique[];
  subtechniquesOptions: MitreSubTechnique[];
  onUpdateTactic: (threatIdx: number, value: string) => void;
  onRemoveTactic: (threatIdx: number) => void;
  onAddTechnique: (threatIdx: number) => void;
  onRemoveTechnique: (threatIdx: number, techIdx: number) => void;
  onUpdateTechnique: (threatIdx: number, techIdx: number, value: string) => void;
  onAddSubtechnique: (threatIdx: number, techIdx: number) => void;
  onRemoveSubtechnique: (threatIdx: number, techIdx: number, subIdx: number) => void;
  onUpdateSubtechnique: (threatIdx: number, techIdx: number, subIdx: number, value: string) => void;
}

const ThreatEntryRow: React.FC<ThreatEntryRowProps> = ({
  entry,
  threatIdx,
  tacticsOptions,
  techniquesOptions,
  subtechniquesOptions,
  onUpdateTactic,
  onRemoveTactic,
  onAddTechnique,
  onRemoveTechnique,
  onUpdateTechnique,
  onAddSubtechnique,
  onRemoveSubtechnique,
  onUpdateSubtechnique,
}) => {
  const tacticValue = useMemo(() => {
    const match = tacticsOptions.find((t) => t.id === entry.tactic.id);
    return match?.value ?? 'none';
  }, [tacticsOptions, entry.tactic.id]);

  const tacticSelectOptions = useMemo(
    () => [
      ...(tacticValue === 'none'
        ? [{ inputDisplay: <>{i18n.TACTIC_PLACEHOLDER}</>, value: 'none' }]
        : []),
      ...tacticsOptions.map((t) => ({ inputDisplay: <>{t.label}</>, value: t.value })),
    ],
    [tacticsOptions, tacticValue]
  );

  const filteredTechniques = useMemo(
    () => techniquesOptions.filter((t) => t.tactics.includes(kebabCase(entry.tactic.name))),
    [techniquesOptions, entry.tactic.name]
  );

  return (
    <div style={{ marginBottom: 12 }}>
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow>
          <EuiSuperSelect
            options={tacticSelectOptions}
            valueOfSelected={tacticValue}
            onChange={(val) => onUpdateTactic(threatIdx, val)}
            fullWidth
            prepend={i18n.TACTIC_LABEL}
            data-test-subj={`mitreTactic-${threatIdx}`}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType="trash"
            color="danger"
            aria-label="Remove tactic"
            onClick={() => onRemoveTactic(threatIdx)}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      {(entry.technique ?? []).map((tech, techIdx) => (
        <TechniqueRow
          key={techIdx}
          tech={tech}
          threatIdx={threatIdx}
          techIdx={techIdx}
          filteredTechniques={filteredTechniques}
          subtechniquesOptions={subtechniquesOptions}
          onUpdateTechnique={onUpdateTechnique}
          onRemoveTechnique={onRemoveTechnique}
          onAddSubtechnique={onAddSubtechnique}
          onRemoveSubtechnique={onRemoveSubtechnique}
          onUpdateSubtechnique={onUpdateSubtechnique}
        />
      ))}

      {entry.tactic.id !== 'none' && (
        <>
          <EuiSpacer size="xs" />
          <EuiButton
            size="s"
            iconType="plusInCircle"
            onClick={() => onAddTechnique(threatIdx)}
            style={{ marginLeft: 24 }}
          >
            {i18n.ADD_TECHNIQUE}
          </EuiButton>
        </>
      )}
    </div>
  );
};

interface TechniqueRowProps {
  tech: NonNullable<ThreatEntry['technique']>[number];
  threatIdx: number;
  techIdx: number;
  filteredTechniques: MitreTechnique[];
  subtechniquesOptions: MitreSubTechnique[];
  onUpdateTechnique: (threatIdx: number, techIdx: number, value: string) => void;
  onRemoveTechnique: (threatIdx: number, techIdx: number) => void;
  onAddSubtechnique: (threatIdx: number, techIdx: number) => void;
  onRemoveSubtechnique: (threatIdx: number, techIdx: number, subIdx: number) => void;
  onUpdateSubtechnique: (threatIdx: number, techIdx: number, subIdx: number, value: string) => void;
}

const TechniqueRow: React.FC<TechniqueRowProps> = ({
  tech,
  threatIdx,
  techIdx,
  filteredTechniques,
  subtechniquesOptions,
  onUpdateTechnique,
  onRemoveTechnique,
  onAddSubtechnique,
  onRemoveSubtechnique,
  onUpdateSubtechnique,
}) => {
  const techSelectOptions = useMemo(
    () => [
      ...(tech.id === 'none'
        ? [{ inputDisplay: <>{i18n.TECHNIQUE_PLACEHOLDER}</>, value: 'none' }]
        : []),
      ...filteredTechniques.map((t) => ({ inputDisplay: <>{t.label}</>, value: t.id })),
    ],
    [filteredTechniques, tech.id]
  );

  const filteredSubs = useMemo(
    () => subtechniquesOptions.filter((s) => s.techniqueId === tech.id),
    [subtechniquesOptions, tech.id]
  );

  return (
    <div style={{ marginLeft: 24, marginTop: 8 }}>
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow>
          <EuiSuperSelect
            options={techSelectOptions}
            valueOfSelected={tech.id}
            onChange={(val) => onUpdateTechnique(threatIdx, techIdx, val)}
            fullWidth
            prepend={i18n.TECHNIQUE_LABEL}
            data-test-subj={`mitreTechnique-${threatIdx}-${techIdx}`}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType="trash"
            color="danger"
            aria-label="Remove technique"
            onClick={() => onRemoveTechnique(threatIdx, techIdx)}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      {(tech.subtechnique ?? []).map((sub, subIdx) => (
        <SubtechniqueRow
          key={subIdx}
          sub={sub}
          threatIdx={threatIdx}
          techIdx={techIdx}
          subIdx={subIdx}
          filteredSubs={filteredSubs}
          onUpdateSubtechnique={onUpdateSubtechnique}
          onRemoveSubtechnique={onRemoveSubtechnique}
        />
      ))}

      {tech.id !== 'none' && filteredSubs.length > 0 && (
        <>
          <EuiSpacer size="xs" />
          <EuiButton
            size="s"
            iconType="plusInCircle"
            onClick={() => onAddSubtechnique(threatIdx, techIdx)}
            style={{ marginLeft: 24 }}
          >
            {i18n.ADD_SUBTECHNIQUE}
          </EuiButton>
        </>
      )}
    </div>
  );
};

interface SubtechniqueRowProps {
  sub: { id: string; name: string; reference: string };
  threatIdx: number;
  techIdx: number;
  subIdx: number;
  filteredSubs: MitreSubTechnique[];
  onUpdateSubtechnique: (threatIdx: number, techIdx: number, subIdx: number, value: string) => void;
  onRemoveSubtechnique: (threatIdx: number, techIdx: number, subIdx: number) => void;
}

const SubtechniqueRow: React.FC<SubtechniqueRowProps> = ({
  sub,
  threatIdx,
  techIdx,
  subIdx,
  filteredSubs,
  onUpdateSubtechnique,
  onRemoveSubtechnique,
}) => {
  const subSelectOptions = useMemo(
    () => [
      ...(sub.id === 'none'
        ? [{ inputDisplay: <>{i18n.SUBTECHNIQUE_PLACEHOLDER}</>, value: 'none' }]
        : []),
      ...filteredSubs.map((s) => ({ inputDisplay: <>{s.label}</>, value: s.id })),
    ],
    [filteredSubs, sub.id]
  );

  return (
    <div style={{ marginLeft: 24, marginTop: 8 }}>
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow>
          <EuiSuperSelect
            options={subSelectOptions}
            valueOfSelected={sub.id}
            onChange={(val) => onUpdateSubtechnique(threatIdx, techIdx, subIdx, val)}
            fullWidth
            prepend={i18n.SUBTECHNIQUE_LABEL}
            data-test-subj={`mitreSubtechnique-${threatIdx}-${techIdx}-${subIdx}`}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType="trash"
            color="danger"
            aria-label="Remove subtechnique"
            onClick={() => onRemoveSubtechnique(threatIdx, techIdx, subIdx)}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};
