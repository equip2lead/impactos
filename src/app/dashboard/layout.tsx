import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { MobileNav } from '@/components/layout/MobileNav'
import { ProfileGate } from '@/components/layout/ProfileGate'
import { OrgGate } from '@/components/layout/OrgGate'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-5">
          {/* ProfileGate first: "no organisation" is only meaningful once we
              know the profile actually loaded. */}
          <ProfileGate><OrgGate>{children}</OrgGate></ProfileGate>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
