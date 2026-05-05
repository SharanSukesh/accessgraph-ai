/**
 * Quick action LWC: "Show Impact in AccessGraph AI" on the PermissionSet
 * detail page. Opens the AccessGraph AI graph view focused on this
 * permission set so the admin can see who's affected and which objects /
 * fields it grants access to.
 */
import { LightningElement, api } from 'lwc'
import { CloseActionScreenEvent } from 'lightning/actions'
import { ShowToastEvent } from 'lightning/platformShowToastEvent'
import issueDeepLink from '@salesforce/apex/AccessGraphConnector.issueDeepLink'

export default class AgOpenPermissionSetImpact extends LightningElement {
    @api recordId

    connectedCallback() {
        this.openLink()
    }

    async openLink() {
        try {
            const url = await issueDeepLink({
                resourceType: 'permission_set',
                resourceId: this.recordId,
            })
            window.open(url, '_blank', 'noopener,noreferrer')
        } catch (err) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Could not open AccessGraph AI',
                    message:
                        (err && err.body && err.body.message) ||
                        'Please try again or open the dashboard manually.',
                    variant: 'error',
                })
            )
        } finally {
            this.dispatchEvent(new CloseActionScreenEvent())
        }
    }
}
