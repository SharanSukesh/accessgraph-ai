/**
 * AccessGraph Explorer
 *
 * Surfaces searchable pickers for Users, Permission Sets, and Fields with an
 * "Open in AccessGraph AI" button per row. Each button mints a single-use
 * deep-link URL via AccessGraphConnector.issueDeepLink and opens it in a new
 * tab so the admin lands on AccessGraph AI's user/PS/field-pivoted view.
 *
 * Lives on the AccessGraph_Explorer_Page Lightning App page (second tab in
 * the AccessGraph AI app). Replaces the "Setup-page detail-button" approach
 * since standard-object QuickActions deploy as global rather than
 * object-scoped from a managed package.
 */
import { LightningElement, track } from 'lwc'
import { ShowToastEvent } from 'lightning/platformShowToastEvent'
import listUsers from '@salesforce/apex/AccessGraphConnector.listUsersForExplorer'
import listPermissionSets from '@salesforce/apex/AccessGraphConnector.listPermissionSetsForExplorer'
import listObjects from '@salesforce/apex/AccessGraphConnector.listObjectsForExplorer'
import listFields from '@salesforce/apex/AccessGraphConnector.listFieldsForExplorer'
import issueDeepLink from '@salesforce/apex/AccessGraphConnector.issueDeepLink'

const SEARCH_DEBOUNCE_MS = 250

export default class AccessGraphExplorer extends LightningElement {
    @track activeTab = 'users'
    @track userSearch = ''
    @track psSearch = ''
    @track objectSearch = ''
    @track fieldSearch = ''
    @track selectedObject = ''
    @track userResults = []
    @track psResults = []
    @track objectResults = []
    @track fieldResults = []
    @track loadingUsers = false
    @track loadingPs = false
    @track loadingObjects = false
    @track loadingFields = false
    @track openingId = null  // id of the row whose deep-link is being issued

    _userTimer
    _psTimer
    _objectTimer
    _fieldTimer

    connectedCallback() {
        // Pre-load each tab once on mount so the user sees results
        // immediately when they click each tab.
        this.fetchUsers('')
        this.fetchPermissionSets('')
        this.fetchObjects('')
    }

    // --- Tab handling ----------------------------------------------------

    handleTabChange(event) {
        this.activeTab = event.target.value
    }

    // --- Users -----------------------------------------------------------

    handleUserSearchInput(event) {
        const value = event.target.value
        this.userSearch = value
        clearTimeout(this._userTimer)
        this._userTimer = setTimeout(() => this.fetchUsers(value), SEARCH_DEBOUNCE_MS)
    }

    async fetchUsers(search) {
        this.loadingUsers = true
        try {
            this.userResults = await listUsers({ searchTerm: search })
        } catch (err) {
            this.toast('Could not load users', this.errMsg(err), 'error')
            this.userResults = []
        } finally {
            this.loadingUsers = false
        }
    }

    // --- Permission Sets -------------------------------------------------

    handlePsSearchInput(event) {
        const value = event.target.value
        this.psSearch = value
        clearTimeout(this._psTimer)
        this._psTimer = setTimeout(() => this.fetchPermissionSets(value), SEARCH_DEBOUNCE_MS)
    }

    async fetchPermissionSets(search) {
        this.loadingPs = true
        try {
            this.psResults = await listPermissionSets({ searchTerm: search })
        } catch (err) {
            this.toast('Could not load permission sets', this.errMsg(err), 'error')
            this.psResults = []
        } finally {
            this.loadingPs = false
        }
    }

    // --- Fields (object picker, then fields) -----------------------------

    handleObjectSearchInput(event) {
        const value = event.target.value
        this.objectSearch = value
        clearTimeout(this._objectTimer)
        this._objectTimer = setTimeout(() => this.fetchObjects(value), SEARCH_DEBOUNCE_MS)
    }

    async fetchObjects(search) {
        this.loadingObjects = true
        try {
            this.objectResults = await listObjects({ searchTerm: search })
        } catch (err) {
            this.toast('Could not load objects', this.errMsg(err), 'error')
            this.objectResults = []
        } finally {
            this.loadingObjects = false
        }
    }

    handleSelectObject(event) {
        const objectName = event.currentTarget.dataset.objectName
        this.selectedObject = objectName
        this.fieldSearch = ''
        this.fetchFields(objectName, '')
    }

    handleFieldSearchInput(event) {
        const value = event.target.value
        this.fieldSearch = value
        clearTimeout(this._fieldTimer)
        this._fieldTimer = setTimeout(
            () => this.fetchFields(this.selectedObject, value),
            SEARCH_DEBOUNCE_MS
        )
    }

    async fetchFields(objectName, search) {
        if (!objectName) {
            this.fieldResults = []
            return
        }
        this.loadingFields = true
        try {
            this.fieldResults = await listFields({
                objectName,
                searchTerm: search,
            })
        } catch (err) {
            this.toast('Could not load fields', this.errMsg(err), 'error')
            this.fieldResults = []
        } finally {
            this.loadingFields = false
        }
    }

    handleClearObject() {
        this.selectedObject = ''
        this.fieldResults = []
        this.fieldSearch = ''
    }

    // --- Deep-link button ------------------------------------------------

    async handleOpen(event) {
        const resourceType = event.currentTarget.dataset.resourceType
        const resourceId = event.currentTarget.dataset.resourceId
        if (this.openingId) return  // already in flight

        this.openingId = resourceId
        try {
            const url = await issueDeepLink({ resourceType, resourceId })
            window.open(url, '_blank', 'noopener,noreferrer')
        } catch (err) {
            this.toast('Could not open AccessGraph AI', this.errMsg(err), 'error')
        } finally {
            this.openingId = null
        }
    }

    // --- Helpers ---------------------------------------------------------

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }))
    }

    errMsg(err) {
        return (err && err.body && err.body.message) || (err && err.message) || 'Unknown error'
    }

    // Getter helpers used by the template

    get hasObjectSelected() {
        return !!this.selectedObject
    }

    get noUserResults() {
        return !this.loadingUsers && this.userResults.length === 0
    }
    get noPsResults() {
        return !this.loadingPs && this.psResults.length === 0
    }
    get noObjectResults() {
        return !this.loadingObjects && this.objectResults.length === 0
    }
    get noFieldResults() {
        return this.hasObjectSelected
            && !this.loadingFields
            && this.fieldResults.length === 0
    }
}
