import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getOrgSummary from '@salesforce/apex/AccessGraphConnector.getOrgSummary';
import triggerSync from '@salesforce/apex/AccessGraphConnector.triggerSync';

export default class AccessGraphHome extends LightningElement {
    syncing = false;
    wiredSummaryResult;
    summary;
    error;

    @wire(getOrgSummary)
    wiredSummary(result) {
        this.wiredSummaryResult = result;
        if (result.data) {
            this.summary = result.data;
            this.error = undefined;
        } else if (result.error) {
            this.error = result.error;
            this.summary = undefined;
        }
    }

    get isLoading() {
        return !this.summary && !this.error;
    }

    get backendReachable() {
        return this.summary && this.summary.backendReachable === true;
    }

    get connectionBadgeVariant() {
        return this.backendReachable ? 'success' : 'warning';
    }

    get connectionBadgeLabel() {
        return this.backendReachable ? 'Connected' : 'Backend Unreachable';
    }

    get lastSyncDisplay() {
        if (!this.summary || !this.summary.lastSyncDate) {
            return 'No syncs yet';
        }
        return this.summary.lastSyncDate;
    }

    get lastSyncStatusLabel() {
        if (!this.summary || !this.summary.lastSyncStatus) {
            return '—';
        }
        // Capitalize first letter
        const s = this.summary.lastSyncStatus;
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    get lastSyncStatusVariant() {
        if (!this.summary || !this.summary.lastSyncStatus) {
            return 'inverse';
        }
        const status = this.summary.lastSyncStatus.toLowerCase();
        if (status === 'completed' || status === 'success') return 'success';
        if (status === 'failed' || status === 'error') return 'error';
        if (status === 'in_progress' || status === 'running') return 'warning';
        return 'inverse';
    }

    get anomalyCount() {
        return this.summary ? this.summary.anomalyCount : 0;
    }

    get recommendationCount() {
        return this.summary ? this.summary.recommendationCount : 0;
    }

    get userCount() {
        return this.summary ? (this.summary.userCount || 0) : 0;
    }

    get profileCount() {
        return this.summary ? (this.summary.profileCount || 0) : 0;
    }

    get permissionSetCount() {
        return this.summary ? (this.summary.permissionSetCount || 0) : 0;
    }

    get objectPermissionCount() {
        return this.summary ? (this.summary.objectPermissionCount || 0) : 0;
    }

    get fieldPermissionCount() {
        return this.summary ? (this.summary.fieldPermissionCount || 0) : 0;
    }

    // Format large counts with thousands separator (e.g. 40003 -> "40,003")
    get objectPermissionCountFormatted() {
        return this.objectPermissionCount.toLocaleString();
    }

    get fieldPermissionCountFormatted() {
        return this.fieldPermissionCount.toLocaleString();
    }

    // True when at least one entity was synced - hides the entire section
    // until the first sync has populated the metadata counts.
    get hasSyncedData() {
        if (!this.summary) return false;
        return (
            (this.summary.userCount || 0) > 0 ||
            (this.summary.profileCount || 0) > 0 ||
            (this.summary.permissionSetCount || 0) > 0
        );
    }

    get hasLastSync() {
        return this.summary && this.summary.lastSyncDate;
    }

    handleSyncClick() {
        this.syncing = true;
        triggerSync()
            .then((result) => {
                const statusCode = result && result.statusCode;
                const detail = (result && result.detail) || '';

                if (statusCode === 200 || statusCode === 202) {
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Sync Started',
                            message: 'AccessGraph AI is syncing your permissions. This typically takes 1-2 minutes.',
                            variant: 'success'
                        })
                    );
                } else if (statusCode === 403) {
                    // OAuth not completed yet - guide user to the dashboard
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'OAuth Setup Required',
                            message: 'Click "Open Full Dashboard" to authorize AccessGraph AI for your org. After you sign in once, "Sync Now" will work from here.',
                            variant: 'warning',
                            mode: 'sticky'
                        })
                    );
                } else if (statusCode === 404) {
                    // Org not yet registered with the backend
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Org Not Registered',
                            message: 'This Salesforce org is not yet registered with AccessGraph AI. Click "Open Full Dashboard" to complete setup.',
                            variant: 'warning',
                            mode: 'sticky'
                        })
                    );
                } else {
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Sync Issue',
                            message: 'The sync request returned status ' + statusCode + (detail ? ': ' + detail : '. Check the full dashboard for details.'),
                            variant: 'warning'
                        })
                    );
                }
                // Refresh wired data so counts/timestamp update after backend completes
                return refreshApex(this.wiredSummaryResult);
            })
            .catch((err) => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Sync Failed',
                        message: (err && err.body && err.body.message) || 'Could not reach AccessGraph AI backend.',
                        variant: 'error'
                    })
                );
            })
            .finally(() => {
                this.syncing = false;
            });
    }

    handleOpenDashboard() {
        if (this.summary && this.summary.dashboardUrl) {
            window.open(this.summary.dashboardUrl, '_blank', 'noopener,noreferrer');
        }
    }
}
