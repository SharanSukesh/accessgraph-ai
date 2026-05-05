import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getOrgSummary from '@salesforce/apex/AccessGraphConnector.getOrgSummary';
import triggerSync from '@salesforce/apex/AccessGraphConnector.triggerSync';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export default class AccessGraphHome extends LightningElement {
    syncing = false;
    wiredSummaryResult;
    summary;
    error;
    pollTimerId;
    pollStartedAt;

    @wire(getOrgSummary)
    wiredSummary(result) {
        this.wiredSummaryResult = result;
        if (result.data) {
            this.summary = result.data;
            this.error = undefined;
            // If a sync is running (kicked off here, from the web app, or
            // still in flight from before this page loaded), poll until it
            // reaches a terminal state. If we were polling and it finished,
            // stop and notify.
            const running = this.isSyncRunning();
            if (running && !this.pollTimerId) {
                this.startPolling();
            } else if (!running && this.pollTimerId) {
                this.stopPolling();
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Sync Complete',
                    message: 'Permission data refreshed.',
                    variant: 'success'
                }));
            }
        } else if (result.error) {
            this.error = result.error;
            this.summary = undefined;
        }
    }

    disconnectedCallback() {
        this.clearPollTimer();
    }

    isSyncRunning() {
        if (!this.summary || !this.summary.lastSyncStatus) return false;
        const s = this.summary.lastSyncStatus.toLowerCase();
        return s === 'running' || s === 'pending' || s === 'in_progress';
    }

    startPolling() {
        if (this.pollTimerId) return;
        this.syncing = true;
        this.pollStartedAt = Date.now();
        this.pollTimerId = setInterval(() => {
            if (Date.now() - this.pollStartedAt > POLL_TIMEOUT_MS) {
                this.stopPolling();
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Sync Taking Longer Than Expected',
                    message: 'Refresh the page or check the full dashboard.',
                    variant: 'warning'
                }));
                return;
            }
            refreshApex(this.wiredSummaryResult);
        }, POLL_INTERVAL_MS);
    }

    stopPolling() {
        this.clearPollTimer();
        this.syncing = false;
    }

    clearPollTimer() {
        if (this.pollTimerId) {
            clearInterval(this.pollTimerId);
            this.pollTimerId = null;
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
        if (this.syncing) return;
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
                    // Pull the new running sync job into the wire cache; the
                    // wired callback then starts polling until it finishes.
                    return refreshApex(this.wiredSummaryResult);
                }

                // Non-success: stop the spinner and surface the reason.
                this.syncing = false;

                if (statusCode === 403) {
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'OAuth Setup Required',
                            message: 'Click "Open Full Dashboard" to authorize AccessGraph AI for your org. After you sign in once, "Sync Now" will work from here.',
                            variant: 'warning',
                            mode: 'sticky'
                        })
                    );
                } else if (statusCode === 404) {
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
                return null;
            })
            .catch((err) => {
                this.syncing = false;
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Sync Failed',
                        message: (err && err.body && err.body.message) || 'Could not reach AccessGraph AI backend.',
                        variant: 'error'
                    })
                );
            });
    }

    handleOpenDashboard() {
        if (this.summary && this.summary.dashboardUrl) {
            window.open(this.summary.dashboardUrl, '_blank', 'noopener,noreferrer');
        }
    }
}
