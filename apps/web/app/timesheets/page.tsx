'use client'

import { AppShell, panel } from '../../components/app-shell'
import { TimesheetsTable } from '../../components/timesheets-table'

export default function TimesheetsPage() {
  return (
    <AppShell title="Timesheets" subtitle="Reporting across date ranges, projects, and customers.">
      <div style={panel}>
        <TimesheetsTable />
      </div>
    </AppShell>
  )
}
