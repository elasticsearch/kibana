import type { PublicMethodsOf } from '@kbn/utility-types';
import type { Observable } from 'rxjs';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type { ILicense, LicenseType } from '@kbn/licensing-types';
import type { RuleType, RuleTypeParams, RuleTypeState, AlertInstanceState, AlertInstanceContext, RuleAlertData } from '../types';
export type ILicenseState = PublicMethodsOf<LicenseState>;
export interface AlertingLicenseInformation {
    showAppLink: boolean;
    enableAppLink: boolean;
    message: string;
}
export declare class LicenseState {
    private licenseInformation;
    private subscription;
    private license?;
    private _notifyUsage;
    constructor(license$: Observable<ILicense>);
    private updateInformation;
    clean(): void;
    getLicenseInformation(): AlertingLicenseInformation;
    getIsSecurityEnabled(): boolean | null;
    setNotifyUsage(notifyUsage: LicensingPluginStart['featureUsage']['notifyUsage']): void;
    getLicenseCheckForRuleType(ruleTypeId: string, ruleTypeName: string, minimumLicenseRequired: LicenseType, { notifyUsage }?: {
        notifyUsage: boolean;
    }): {
        isValid: true;
    } | {
        isValid: false;
        reason: 'unavailable' | 'expired' | 'invalid';
    };
    private notifyUsage;
    checkLicense(license: ILicense | undefined): AlertingLicenseInformation;
    ensureLicenseForGapAutoFillScheduler(): void;
    ensureLicenseForMaintenanceWindow(): void;
    ensureLicenseForRuleType<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, State extends RuleTypeState, InstanceState extends AlertInstanceState, InstanceContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData>(ruleType: RuleType<Params, ExtractedParams, State, InstanceState, InstanceContext, ActionGroupIds, RecoveryActionGroupId, AlertData>): void;
}
export declare function verifyApiAccessFactory(licenseState: LicenseState): () => null;
