'use client'

// Route entry — the actual page body lives in `./view` so it can be
// reused by the merged Schema page (`../schema/page.tsx`). Next.js's
// page-props checker forbids non-default exports on `page.tsx`; the
// view sits next to it as a non-routed file.
import { ObjectsView } from './view'

export default function ObjectsPage() {
  return <ObjectsView />
}
