import type { PublicMethodsOf } from '@kbn/utility-types';
import type { Observable } from 'rxjs';
import type { ILicense } from '@kbn/licensing-types';
export type ILicenseState = PublicMethodsOf<LicenseState>;
export interface MaintenanceWindowsLicenseInfo {
    showAppLink: boolean;
    enableAppLink: boolean;
    message: string;
}
export declare class LicenseState {
    private licenseInformation;
    private subscription;
    private license?;
    constructor(license$: Observable<ILicense>);
    private updateInformation;
    clean(): void;
    getLicenseInformation(): MaintenanceWindowsLicenseInfo;
    getIsSecurityEnabled(): boolean | null;
    checkLicense(license: ILicense | undefined): MaintenanceWindowsLicenseInfo;
    ensureLicenseForMaintenanceWindow(): void;
}
export declare function verifyApiAccessFactory(licenseState: LicenseState): () => null;
