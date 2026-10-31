import { useRouter } from 'next/navigation'
import { authService } from '@/features/auth/services/auth.service'
import { reportService } from '@/features/reports/services/report.service'
import { profileService } from '@/features/profile/services/profile.service'
import { ChequeWithRelations } from '@/types'
import { useTranslations } from 'next-intl'

export function useSettings() {
  const router = useRouter()
  const t = useTranslations('Settings')

  const handleExport = async (
    cheques: ChequeWithRelations[] | undefined,
    businessName: string,
  ) => {
    if (!cheques || cheques.length === 0) {
      alert('No cheques found to export.')
      return
    }
    await reportService.exportToCSV(
      cheques,
      `${businessName || 'Business'}_Cheques.csv`,
    )
  }

  const handleLogout = async () => {
    await authService.signOut()
    router.push('/login')
  }

  const handleDeleteProfile = async () => {
    const result = await profileService.delete()
    if (!result.providerCleanup) alert(t('deactivationCleanupWarning'))
    router.replace('/login')
  }

  return {
    handleExport,
    handleLogout,
    handleDeleteProfile,
  }
}
