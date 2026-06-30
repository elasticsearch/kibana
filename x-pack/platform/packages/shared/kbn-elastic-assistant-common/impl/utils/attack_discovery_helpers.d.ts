import type { AttackDiscovery, Replacements } from '../..';
export declare const RECONNAISSANCE = "Reconnaissance";
export declare const RESOURCE_DEVELOPMENT = "Resource Development";
export declare const INITIAL_ACCESS = "Initial Access";
export declare const EXECUTION = "Execution";
export declare const PERSISTENCE = "Persistence";
export declare const PRIVILEGE_ESCALATION = "Privilege Escalation";
export declare const DEFENSE_EVASION = "Defense Evasion";
export declare const CREDENTIAL_ACCESS = "Credential Access";
export declare const DISCOVERY = "Discovery";
export declare const LATERAL_MOVEMENT = "Lateral Movement";
export declare const COLLECTION = "Collection";
export declare const COMMAND_AND_CONTROL = "Command and Control";
export declare const EXFILTRATION = "Exfiltration";
export declare const IMPACT = "Impact";
/** A subset of the Mitre Attack Tactics */
export declare const MITRE_ATTACK_TACTICS_SUBSET: readonly ["Reconnaissance", "Resource Development", "Initial Access", "Execution", "Persistence", "Privilege Escalation", "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement", "Collection", "Command and Control", "Exfiltration", "Impact"];
export declare const getTacticLabel: (tactic: string) => string;
export interface TacticMetadata {
    detected: boolean;
    index: number;
    name: string;
}
export declare const getTacticMetadata: (mitreAttackTactics: AttackDiscovery["mitreAttackTactics"]) => TacticMetadata[];
/**
 * The LLM sometimes returns a string with newline literals.
 * This function replaces them with actual newlines
 */
export declare const replaceNewlineLiterals: (markdown: string) => string;
export declare const getOriginalAlertIds: ({ alertIds, replacements, }: {
    alertIds: AttackDiscovery["alertIds"];
    replacements?: Replacements;
}) => string[];
export declare const transformInternalReplacements: (internal: Array<{
    value: string;
    uuid: string;
}>) => Record<string, string>;
