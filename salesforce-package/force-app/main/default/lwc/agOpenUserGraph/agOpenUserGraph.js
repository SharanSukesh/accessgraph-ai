/**
 * Quick action LWC: "Open in AccessGraph AI" on the User detail page.
 *
 * Calls AccessGraphConnector.issueDeepLink with the current User record's
 * Salesforce Id, gets back a single-use redeem URL, and opens it in a new
 * tab. The user lands on AccessGraph AI's user-centric graph view for that
 * person.
 */
import { LightningElement, api } from 'lwc'
import { CloseActionScreenEvent } from 'lightning/actions'
import { ShowToastEvent } from 'lightning/platformShowToastEvent'
import issueDeepLink from '@salesforce/apex/AccessGraphConnector.issueDeepLink'

export default class AgOpenUserGraph extends LightningElement {
    @api recordId

    connectedCallback() {
        this.openLink()
    }

    async openLink() {
        try {
            const url = await issueDeepLink({
                resourceType: 'user',
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
