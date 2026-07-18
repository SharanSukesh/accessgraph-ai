import { redirect } from 'next/navigation'

/** /v2 root — straight to the demo org overview. */
export default function V2Index() {
  redirect('/v2/orgs/demo/dashboard')
}
