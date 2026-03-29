'use client'

import { AppShell, panel } from '../../components/app-shell'
import { SectionHeaderWithInfo } from '../../components/info-flag'
import { TimesheetsTable } from '../../components/timesheets-table'

export default function TimesheetsPage() {
  return (
    <AppShell title="Timesheets" subtitle="Reporting across date ranges, projects, and customers.">
      <div style={panel}>
        <SectionHeaderWithInfo
          title="Timesheets"
          info="Validated entries are hidden by default. Turn this on to review them and uncheck validation to restore them."
          marginBottom={14}
        />
        <TimesheetsTable />
      </div>
    </AppShell>
  )
}
