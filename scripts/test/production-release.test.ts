// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  deployProduction,
  releaseConfiguration,
} from '../production-deploy.mjs'

const env = {
  VERCEL_TOKEN: 'test-token',
  VERCEL_PROJECT_ID: 'prj_test',
  VERCEL_TEAM_ID: 'team_test',
  VERCEL_REPO_ID: '123',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REF: 'refs/heads/main',
}
const json = (body: unknown) => new Response(JSON.stringify(body))

describe('production release automation', () => {
  it('requires main, an exact SHA and all deployment configuration', () => {
    expect(releaseConfiguration(env).sha).toBe(env.GITHUB_SHA)
    expect(() =>
      releaseConfiguration({ ...env, GITHUB_REF: 'refs/heads/qa' }),
    ).toThrow('main')
    expect(() => releaseConfiguration({ ...env, GITHUB_SHA: 'main' })).toThrow(
      'SHA',
    )
    expect(() => releaseConfiguration({ ...env, VERCEL_TOKEN: '' })).toThrow(
      'VERCEL_TOKEN',
    )
    expect(() =>
      releaseConfiguration({ ...env, VERCEL_REPO_ID: 'owner/repo' }),
    ).toThrow('numeric')
  })

  it('deploys the migrated SHA and waits until that production commit is ready', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 'dpl_test' }))
      .mockResolvedValueOnce(json({ readyState: 'BUILDING' }))
      .mockResolvedValueOnce(
        json({
          readyState: 'READY',
          target: 'production',
          gitSource: { sha: env.GITHUB_SHA },
        }),
      )
    const sleep = vi.fn()
    await expect(
      deployProduction(releaseConfiguration(env), { fetch, sleep }),
    ).resolves.toEqual({ id: 'dpl_test', sha: env.GITHUB_SHA })
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.gitSource).toEqual({
      type: 'github',
      repoId: '123',
      ref: 'main',
      sha: env.GITHUB_SHA,
    })
    expect(body.target).toBe('production')
    expect(sleep).toHaveBeenCalledOnce()
  })

  it.each(['ERROR', 'CANCELED'])('fails on Vercel %s', async (readyState) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 'dpl_test' }))
      .mockResolvedValueOnce(json({ readyState }))
    await expect(
      deployProduction(releaseConfiguration(env), { fetch }),
    ).rejects.toThrow(readyState)
  })

  it('does not report success for a different commit', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 'dpl_test' }))
      .mockResolvedValueOnce(
        json({
          readyState: 'READY',
          target: 'production',
          gitSource: { sha: 'b'.repeat(40) },
        }),
      )
    await expect(
      deployProduction(releaseConfiguration(env), { fetch }),
    ).rejects.toThrow('does not match')
  })

  it('fails on API errors without exposing the response body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('private-provider-content', { status: 403 }),
      )
    await expect(
      deployProduction(releaseConfiguration(env), { fetch }),
    ).rejects.toThrow('HTTP 403')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('fails explicitly when no deployment ID is returned or polling times out', async () => {
    await expect(
      deployProduction(releaseConfiguration(env), {
        fetch: vi.fn().mockResolvedValue(json({})),
      }),
    ).rejects.toThrow('deployment ID')
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 'dpl_test' }))
      .mockImplementation(async () => json({ readyState: 'BUILDING' }))
    await expect(
      deployProduction(releaseConfiguration(env), {
        fetch,
        sleep: vi.fn(),
        attempts: 2,
      }),
    ).rejects.toThrow('Timed out')
  })

  it('serializes releases, disables automatic main deployments and gates deploy on migration success', () => {
    const workflow = readFileSync(
      '.github/workflows/production-release.yml',
      'utf8',
    )
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain('environment: production')
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'")
    expect(workflow).toContain('ref: ${{ github.sha }}')
    expect(
      workflow.indexOf('Apply Production Database Migrations'),
    ).toBeLessThan(workflow.indexOf('Deploy Migrated Commit'))
    expect(workflow).not.toContain('continue-on-error')
    expect(workflow).not.toContain('db:reset')
    expect(
      JSON.parse(readFileSync('vercel.json', 'utf8')).git.deploymentEnabled
        .main,
    ).toBe(false)
  })
})
