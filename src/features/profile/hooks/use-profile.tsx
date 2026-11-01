'use client'

import { createContext, useContext } from 'react'
import { useEffect } from 'react'
import { Profile } from '@/types'
import { profileService } from '@/features/profile/services/profile.service'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { FormattingContext } from './use-display-format'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'

interface ProfileContextType {
  profile: Profile | null
  isLoading: boolean
  updateProfile: (profile: Partial<Profile>) => Promise<void>
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const locale = useLocale()
  const router = useRouter()

  const { data: profile, isLoading } = useQuery({
    queryKey: queryKeys.profile.detail(),
    queryFn: () => profileService.get(),
  })

  useEffect(() => {
    document.documentElement.toggleAttribute(
      'data-reduce-motion',
      profile?.reduce_motion === true,
    )
  }, [profile?.reduce_motion])

  useEffect(() => {
    if (profile?.language && profile.language !== locale) {
      document.cookie = `NEXT_LOCALE=${profile.language}; path=/; max-age=31536000; SameSite=Lax`
      router.refresh()
    }
  }, [profile?.language, locale, router])

  const mutation = useMutation({
    mutationFn: (newProfile: Partial<Profile>) =>
      profileService.update(newProfile),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(queryKeys.profile.detail(), updatedProfile)
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail() })
    },
  })

  const updateProfile = async (newProfile: Partial<Profile>) => {
    await mutation.mutateAsync(newProfile)
  }

  return (
    <FormattingContext.Provider value={profile ?? null}>
      <ProfileContext.Provider
        value={{
          profile: profile || null,
          isLoading,
          updateProfile,
        }}
      >
        {children}
      </ProfileContext.Provider>
    </FormattingContext.Provider>
  )
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider')
  }
  return context
}
