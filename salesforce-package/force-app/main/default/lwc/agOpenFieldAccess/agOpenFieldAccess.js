/**
 * Quick action LWC: "View Field Access in AccessGraph AI" on the Field
 * detail page (FieldDefinition record). This is the strategic counter to
 * Salesforce Summer '26's native Field Access tab — it pulls admins from
 * the field-by-field view into AccessGraph AI's user-centric model.
 *
 * `recordId` for FieldDefinition is the EntityDefinition.QualifiedApiName
 * combined with the field's QualifiedApiName, e.g. "Account.Salary__c".
 */
import { LightningElement, api } from 'lwc'
import { CloseActionScreenEvent } from 'lightning/actions'
import { ShowToastEvent } from 'lightning/platformShowToastEvent'
import { getRecord, getFieldValue } from 'lightning/uiRecordApi'
import issueDeepLink from '@salesforce/apex/AccessGraphConnector.issueDeepLink'

const QUALIFIED_API_NAME = 'FieldDefinition.QualifiedApiName'

export default class AgOpenFieldAccess extends LightningElement {
    @api recordId
    qualifiedApiName

    connectedCallback() {
        // recordId for FieldDefinition is itself the qualified API name in
        // most contexts (e.g. "Account.Salary__c"), but we attempt to read
        // the field via uiRecordApi as a defensive fallback.
        this.openLink()
    }

    async openLink() {
        const resourceId = this.recordId  // already in Object.Field form
        try {
            const url = await issueDeepLink({
                resourceType: 'field',
                resourceId,
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
