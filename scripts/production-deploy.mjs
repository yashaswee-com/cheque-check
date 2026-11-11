import { pathToFileURL } from 'node:url'

export function releaseConfiguration(env) {
  for (const key of [
    'VERCEL_TOKEN',
    'VERCEL_PROJECT_ID',
    'VERCEL_TEAM_ID',
    'VERCEL_REPO_ID',
    'GITHUB_SHA',
  ]) {
    if (!env[key]?.trim())
      throw new Error(`Missing release configuration: ${key}`)
  }
  if (env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Production releases must run from main')
  }
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA)) {
    throw new Error('Release requires a full Git commit SHA')
  }
  if (!/^\d+$/.test(env.VERCEL_REPO_ID)) {
    throw new Error('VERCEL_REPO_ID must be the numeric GitHub repository ID')
  }
  return {
    token: env.VERCEL_TOKEN,
    project: env.VERCEL_PROJECT_ID,
    team: env.VERCEL_TEAM_ID,
    repo: env.VERCEL_REPO_ID,
    sha: env.GITHUB_SHA,
  }
}

export async function deployProduction(
  configuration,
  {
    fetch: request = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    attempts = 120,
  } = {},
) {
  const { token, project, team, repo, sha } = configuration
  const api = async (path, options = {}) => {
    let response
    try {
      response = await request(
        `https://api.vercel.com${path}?teamId=${encodeURIComponent(team)}`,
        {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(30_000),
        },
      )
    } catch {
      throw new Error('Vercel request failed due to a network error or timeout')
    }
    // Provider bodies may include environment values; never print raw responses.
    if (!response.ok)
      throw new Error(`Vercel request failed (HTTP ${response.status})`)
    try {
      return await response.json()
    } catch {
      throw new Error('Vercel returned an invalid JSON response')
    }
  }
  const deployment = await api('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: 'cheque-check',
      project,
      target: 'production',
      gitSource: { type: 'github', repoId: repo, ref: 'main', sha },
      meta: { migratedCommitSha: sha },
    }),
  })
  if (typeof deployment.id !== 'string' || !deployment.id) {
    throw new Error('Vercel did not return a deployment ID')
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await api(
      `/v13/deployments/${encodeURIComponent(deployment.id)}`,
    )
    if (status.readyState === 'ERROR' || status.readyState === 'CANCELED') {
      throw new Error(`Vercel deployment ${status.readyState}`)
    }
    if (status.readyState === 'READY') {
      if (status.gitSource?.sha !== sha || status.target !== 'production') {
        throw new Error(
          'Vercel deployment does not match the migrated production commit',
        )
      }
      return { id: deployment.id, sha }
    }
    await sleep(10_000)
  }
  throw new Error(
    'Timed out waiting for Vercel deployment; inspect Vercel before retrying',
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const configuration = releaseConfiguration(process.env)
    if (process.argv.includes('--check')) {
      console.log('Production deployment configuration is present and valid.')
    } else {
      const result = await deployProduction(configuration)
      console.log(
        `Production deployment ${result.id} is READY at ${result.sha}.`,
      )
    }
  } catch (error) {
    // Avoid logging fetch exceptions that may contain headers or request bodies.
    console.error(
      error instanceof Error ? error.message : 'Production deployment failed',
    )
    process.exitCode = 1
  }
}
