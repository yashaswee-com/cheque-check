import { Profile } from '@/types'
import { createLazyService } from '@/lib/lazy-service'
import {
  IProfileRepository,
  SupabaseProfileRepository,
} from '@/features/profile/repositories/profile.repository'

export class ProfileService {
  constructor(
    private readonly repository: IProfileRepository = new SupabaseProfileRepository(),
  ) {}

  async get(): Promise<Profile | null> {
    return this.repository.get()
  }

  async update(profile: Partial<Profile>): Promise<Profile> {
    return this.repository.update(profile)
  }

  async delete(): Promise<{ providerCleanup: boolean }> {
    return this.repository.delete()
  }
}

export const profileService = createLazyService(
  () => new ProfileService(),
  ProfileService.prototype,
)
