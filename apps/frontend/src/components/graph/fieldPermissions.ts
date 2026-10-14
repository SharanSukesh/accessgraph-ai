/**
 * A field's Edit only counts when the object is editable too: Salesforce
 * never lets a user edit a field on an object they can only read.
 */
export type FieldEditState = 'none' | 'available' | 'blocked'

export const BLOCKED_EDIT_TOOLTIP =
  'Field Edit is granted, but the object is Read only, so this field cannot be edited.'

export function fieldEditState(fieldCanEdit: boolean, objectCanEdit: boolean): FieldEditState {
  if (!fieldCanEdit) return 'none'
  return objectCanEdit ? 'available' : 'blocked'
}
