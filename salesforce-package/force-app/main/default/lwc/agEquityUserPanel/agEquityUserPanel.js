/**
 * AccessGraph AI — Equity panel for the User record page.
 *
 * Surfaces the GAEA equity drill-down (distance to nearest VIP, dept avg,
 * org avg, VIP status) plus any active equity recommendations targeting
 * this user. Reuses the existing AccessGraphConnector Apex layer; no new
 * auth surface — the same Remote Site Setting whitelists the callouts.
 *
 * Placement: drop onto User's Lightning Record Page via App Builder.
 */
import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { getRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getUserEquity from '@salesforce/apex/AccessGraphConnector.getUserEquity';
import getUserEquityRecommendations from '@salesforce/apex/AccessGraphConnector.getUserEquityRecommendations';
import updateRecommendationStatus from '@salesforce/apex/AccessGraphConnector.updateRecommendationStatus';

const USER_FIELDS = ['User.Id', 'User.Name'];

export default class AgEquityUserPanel extends LightningElement {
    @api recordId;  // populated by lightning__RecordPage target

    userSfId;
    userName;
    equity;
    recs = [];
    equityWired;
    recsWired;
    isLoading = true;
    actionInFlight = false;

    @wire(getRecord, { recordId: '$recordId', fields: USER_FIELDS })
    wiredUser({ data }) {
        if (data) {
            this.userSfId = data.fields.Id.value;
            this.userName = data.fields.Name.value;
        }
    }

    @wire(getUserEquity, { userSfId: '$userSfId' })
    wiredEquity(result) {
        this.equityWired = result;
        if (result.data) {
            this.equity = result.data;
            this.isLoading = false;
        } else if (result.error) {
            this.equity = null;
            this.isLoading = false;
        }
    }

    @wire(getUserEquityRecommendations, { userSfId: '$userSfId' })
    wiredRecs(result) {
        this.recsWired = result;
        if (result.data) {
            this.recs = result.data;
        }
    }

    get hasEquityData() {
        return this.equity && !this.equity.errorReason;
    }

    get errorReason() {
        return this.equity ? this.equity.errorReason : null;
    }

    // Friendly distance display: null → "Unreachable", otherwise 2dp + " hops"
    get distanceDisplay() {
        if (!this.equity) return '—';
        const d = this.equity.distanceToNearestVip;
        if (d === null || d === undefined) return 'Unreachable';
        return `${d.toFixed(2)} hops`;
    }

    get utilityDisplay() {
        if (!this.equity) return '—';
        return this.equity.utility != null ? this.equity.utility.toFixed(3) : '—';
    }

    get departmentAvgDisplay() {
        if (!this.equity) return '—';
        return this.equity.departmentAvgUtility != null
            ? this.equity.departmentAvgUtility.toFixed(3)
            : '—';
    }

    get orgAvgDisplay() {
        if (!this.equity) return '—';
        return this.equity.orgAvgUtility != null
            ? this.equity.orgAvgUtility.toFixed(3)
            : '—';
    }

    // Visual indicator: "above / below dept" so admins immediately see whether
    // this user is dragging their group down or contributing positively.
    get utilityCompareLabel() {
        if (!this.equity) return '';
        const u = this.equity.utility;
        const d = this.equity.departmentAvgUtility;
        if (u == null || d == null) return '';
        const delta = u - d;
        if (Math.abs(delta) < 0.001) return 'at department average';
        return delta > 0
            ? `${delta.toFixed(3)} above department average`
            : `${(-delta).toFixed(3)} below department average`;
    }

    get utilityCompareClass() {
        if (!this.equity) return '';
        const u = this.equity.utility;
        const d = this.equity.departmentAvgUtility;
        if (u == null || d == null) return '';
        if (Math.abs(u - d) < 0.001) return 'slds-text-color_weak';
        return u >= d
            ? 'slds-text-color_success'
            : 'slds-text-color_error';
    }

    get hasRecommendations() {
        return this.recs && this.recs.length > 0;
    }

    get vipBadgeVariant() {
        return this.equity && this.equity.isVip ? 'success' : 'inverse';
    }

    get vipBadgeLabel() {
        if (!this.equity) return '';
        return this.equity.isVip ? 'VIP' : 'Junior';
    }

    // Each rec card needs derived state for styling (applied/dismissed)
    get decoratedRecs() {
        return (this.recs || []).map(r => ({
            ...r,
            isApplied: r.status === 'applied',
            isDismissed: r.status === 'rejected' || r.status === 'dismissed',
            cardClass:
                r.status === 'applied' || r.status === 'rejected'
                    ? 'slds-box slds-p-around_small slds-m-bottom_x-small slds-theme_shade'
                    : 'slds-box slds-p-around_small slds-m-bottom_x-small',
        }));
    }

    async handleApply(event) {
        const recId = event.target.dataset.recId;
        await this.updateRecStatus(recId, 'applied', 'Marked applied.');
    }

    async handleDismiss(event) {
        const recId = event.target.dataset.recId;
        await this.updateRecStatus(recId, 'rejected', 'Dismissed.');
    }

    async updateRecStatus(recId, newStatus, successMessage) {
        if (!recId || this.actionInFlight) return;
        this.actionInFlight = true;
        try {
            const result = await updateRecommendationStatus({
                recId,
                newStatus,
            });
            if (result && result.success) {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'AccessGraph Equity',
                        message: successMessage,
                        variant: 'success',
                    }),
                );
                await refreshApex(this.recsWired);
            } else {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'AccessGraph Equity',
                        message: (result && result.message) || 'Update failed.',
                        variant: 'error',
                    }),
                );
            }
        } catch (err) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'AccessGraph Equity',
                    message: err.body ? err.body.message : err.message,
                    variant: 'error',
                }),
            );
        } finally {
            this.actionInFlight = false;
        }
    }

    async handleRefresh() {
        this.isLoading = true;
        try {
            await Promise.all([
                refreshApex(this.equityWired),
                refreshApex(this.recsWired),
            ]);
        } finally {
            this.isLoading = false;
        }
    }
}
