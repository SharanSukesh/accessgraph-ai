/**
 * AccessGraph AI — Equity tab.
 *
 * Renders the org-level equity diagnostic + an all-users table sorted
 * worst-off-first. Selecting a row opens a drill-down panel showing the
 * user's distance to nearest VIP, dept avg, org avg, and the policy's
 * suggested grants for them (with Apply / Dismiss actions).
 *
 * Same Apex layer as the User-detail-page panel — reuses the wired
 * methods on AccessGraphConnector so caches dedupe across surfaces.
 */
import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getEquityDiagnostic from '@salesforce/apex/AccessGraphConnector.getEquityDiagnostic';
import getEquityUserList from '@salesforce/apex/AccessGraphConnector.getEquityUserList';
import getUserEquity from '@salesforce/apex/AccessGraphConnector.getUserEquity';
import getUserEquityRecommendations from '@salesforce/apex/AccessGraphConnector.getUserEquityRecommendations';
import generateEquityRecommendations from '@salesforce/apex/AccessGraphConnector.generateEquityRecommendations';
import updateRecommendationStatus from '@salesforce/apex/AccessGraphConnector.updateRecommendationStatus';

const PAGE_LIMIT = 200;

const USER_COLUMNS = [
    { label: 'User', fieldName: 'name', type: 'text', initialWidth: 200 },
    { label: 'Department', fieldName: 'department', type: 'text', initialWidth: 140 },
    {
        label: 'Distance to VIP',
        fieldName: 'distanceDisplay',
        type: 'text',
        initialWidth: 140,
        cellAttributes: { class: { fieldName: 'distanceClass' } },
    },
    {
        label: 'Utility',
        fieldName: 'utilityDisplay',
        type: 'text',
        initialWidth: 100,
    },
    {
        label: 'Dept avg',
        fieldName: 'deptAvgDisplay',
        type: 'text',
        initialWidth: 100,
    },
    {
        label: 'VIP?',
        fieldName: 'vipLabel',
        type: 'text',
        initialWidth: 70,
    },
    {
        label: 'Open recs',
        fieldName: 'openRecommendations',
        type: 'number',
        initialWidth: 100,
        cellAttributes: { alignment: 'right' },
    },
];

export default class AccessGraphEquity extends LightningElement {
    diagnostic;
    diagnosticWired;
    users = [];
    usersWired;
    selectedUserId;
    selectedUserDetail;
    selectedUserDetailWired;
    selectedUserRecs = [];
    selectedUserRecsWired;
    generating = false;
    columns = USER_COLUMNS;

    @wire(getEquityDiagnostic)
    wiredDiagnostic(result) {
        this.diagnosticWired = result;
        if (result.data) {
            this.diagnostic = result.data;
        }
    }

    @wire(getEquityUserList, { pageLimit: PAGE_LIMIT })
    wiredUsers(result) {
        this.usersWired = result;
        if (result.data) {
            // Decorate for the datatable
            this.users = result.data.map(u => ({
                ...u,
                id: u.userSfId,
                distanceDisplay:
                    u.distanceToNearestVip == null
                        ? 'Unreachable'
                        : u.distanceToNearestVip.toFixed(2),
                distanceClass:
                    u.distanceToNearestVip == null
                        ? 'slds-text-color_error'
                        : '',
                utilityDisplay: u.utility != null ? u.utility.toFixed(3) : '—',
                deptAvgDisplay:
                    u.departmentAvgUtility != null
                        ? u.departmentAvgUtility.toFixed(3)
                        : '—',
                vipLabel: u.isVip ? 'VIP' : 'Junior',
            }));
        }
    }

    @wire(getUserEquity, { userSfId: '$selectedUserId' })
    wiredSelectedUserEquity(result) {
        this.selectedUserDetailWired = result;
        if (result.data) {
            this.selectedUserDetail = result.data;
        }
    }

    @wire(getUserEquityRecommendations, { userSfId: '$selectedUserId' })
    wiredSelectedUserRecs(result) {
        this.selectedUserRecsWired = result;
        if (result.data) {
            this.selectedUserRecs = result.data;
        }
    }

    // --- Layout / button helpers ---
    get listSize() {
        // When a row is selected, the user list takes half the width and
        // the drill-down panel takes the other half. Otherwise the list
        // fills the row.
        return this.selectedUserId ? '6' : '12';
    }

    get generateButtonLabel() {
        return this.generating ? 'Generating…' : 'Generate recommendations';
    }

    // We use single-row selection via max-row-selection=1; checkbox column
    // makes that intent obvious to the user. Keeping it visible.
    get hideCheckbox() {
        return false;
    }

    // --- Diagnostic header derived state ---
    get hasDiagnostic() {
        return this.diagnostic && this.diagnostic.hasData;
    }

    get errorReason() {
        return this.diagnostic ? this.diagnostic.errorReason : null;
    }

    get equityIndexDisplay() {
        if (!this.hasDiagnostic) return '—';
        return this.diagnostic.equityIndex != null
            ? this.diagnostic.equityIndex.toFixed(2)
            : '—';
    }

    get mostDisadvantagedDisplay() {
        if (!this.hasDiagnostic) return '—';
        return this.diagnostic.mostDisadvantagedGroup || '—';
    }

    get vipCountDisplay() {
        if (!this.hasDiagnostic) return '—';
        return this.diagnostic.vipCount != null ? this.diagnostic.vipCount : '—';
    }

    // --- User selection ---
    handleRowSelection(event) {
        const selected = event.detail.selectedRows;
        if (!selected || !selected.length) {
            this.selectedUserId = null;
            return;
        }
        this.selectedUserId = selected[0].userSfId;
    }

    handleClearSelection() {
        this.selectedUserId = null;
        const table = this.template.querySelector('lightning-datatable');
        if (table) table.selectedRows = [];
    }

    get hasSelectedUser() {
        return !!this.selectedUserId;
    }

    get selectedUserName() {
        if (!this.selectedUserId || !this.users) return '';
        const u = this.users.find(x => x.userSfId === this.selectedUserId);
        return u ? u.name : this.selectedUserId;
    }

    get selectedDistanceDisplay() {
        if (!this.selectedUserDetail) return '—';
        const d = this.selectedUserDetail.distanceToNearestVip;
        if (d === null || d === undefined) return 'Unreachable';
        return `${d.toFixed(2)} hops`;
    }

    get selectedUtilityDisplay() {
        if (!this.selectedUserDetail) return '—';
        return this.selectedUserDetail.utility != null
            ? this.selectedUserDetail.utility.toFixed(3)
            : '—';
    }

    get selectedDeptAvgDisplay() {
        if (!this.selectedUserDetail) return '—';
        return this.selectedUserDetail.departmentAvgUtility != null
            ? this.selectedUserDetail.departmentAvgUtility.toFixed(3)
            : '—';
    }

    get selectedOrgAvgDisplay() {
        if (!this.selectedUserDetail) return '—';
        return this.selectedUserDetail.orgAvgUtility != null
            ? this.selectedUserDetail.orgAvgUtility.toFixed(3)
            : '—';
    }

    get selectedIsVip() {
        return this.selectedUserDetail && this.selectedUserDetail.isVip;
    }

    get selectedHasRecs() {
        return this.selectedUserRecs && this.selectedUserRecs.length > 0;
    }

    get decoratedSelectedRecs() {
        return (this.selectedUserRecs || []).map(r => ({
            ...r,
            isApplied: r.status === 'applied',
            isDismissed: r.status === 'rejected' || r.status === 'dismissed',
            cardClass:
                r.status === 'applied' || r.status === 'rejected'
                    ? 'slds-box slds-p-around_small slds-m-bottom_x-small slds-theme_shade'
                    : 'slds-box slds-p-around_small slds-m-bottom_x-small',
        }));
    }

    // --- Mutating actions ---
    async handleApply(event) {
        const recId = event.target.dataset.recId;
        await this.updateRec(recId, 'applied', 'Marked applied.');
    }

    async handleDismiss(event) {
        const recId = event.target.dataset.recId;
        await this.updateRec(recId, 'rejected', 'Dismissed.');
    }

    async updateRec(recId, newStatus, message) {
        if (!recId) return;
        try {
            const result = await updateRecommendationStatus({ recId, newStatus });
            if (result && result.success) {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'AccessGraph Equity',
                        message,
                        variant: 'success',
                    }),
                );
                await Promise.all([
                    refreshApex(this.selectedUserRecsWired),
                    refreshApex(this.usersWired),  // open-rec count may change
                ]);
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
        }
    }

    async handleGenerate() {
        if (this.generating) return;
        this.generating = true;
        try {
            const result = await generateEquityRecommendations();
            if (result && result.success) {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'AccessGraph Equity',
                        message: 'Equity recommendations generated.',
                        variant: 'success',
                    }),
                );
                await Promise.all([
                    refreshApex(this.diagnosticWired),
                    refreshApex(this.usersWired),
                    this.selectedUserId
                        ? refreshApex(this.selectedUserRecsWired)
                        : Promise.resolve(),
                ]);
            } else {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'AccessGraph Equity',
                        message:
                            (result && result.message) ||
                            'Generation failed. Try again or check the web dashboard.',
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
            this.generating = false;
        }
    }
}
