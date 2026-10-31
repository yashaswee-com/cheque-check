import { expect, test } from '@playwright/test'
import { AppShell } from '../pages/app-shell.page'
import { LoginPage } from '../pages/login.page'
import { ProfilePage } from '../pages/profile.page'
import { signInAsNewOnboardedUser } from '../flows'
import { uniqueE2eName } from '../fixtures/test-data'

// Profile changes are account-wide, so each journey uses its own user.
test.describe('profile', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('an owner corrects their name and sees it across the app', async ({
    page,
  }) => {
    await signInAsNewOnboardedUser(page, 'profile')
    const newName = uniqueE2eName('renamed')

    await new AppShell(page).openSettings()
    await page.locator('a[href="/profile"]').click()
    const profilePage = new ProfilePage(page)
    await expect(profilePage.nameInput).toBeVisible()
    await expect(profilePage.saveButton).toBeDisabled()
    await profilePage.rename(newName)
    await expect(profilePage.saveButton).toBeDisabled()

    await page.reload()
    await expect(profilePage.nameInput).toHaveValue(newName)
    await page.goto('/settings')
    await expect(page.locator('a[href="/profile"]')).toContainText(newName)
  })

  test('an owner deletes their account and can no longer sign in', async ({
    page,
  }) => {
    const { user } = await signInAsNewOnboardedUser(page, 'delete-me')
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.accept()
    })

    const profilePage = new ProfilePage(page)
    await profilePage.goto()
    await profilePage.deleteAccount()
    await expect(page).toHaveURL('/login')

    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')

    const loginPage = new LoginPage(page)
    dialogs.length = 0
    await loginPage.login(user.email, user.password)
    await expect.poll(() => dialogs.length).toBeGreaterThan(0)
    await expect(page).toHaveURL('/login')
  })
})
