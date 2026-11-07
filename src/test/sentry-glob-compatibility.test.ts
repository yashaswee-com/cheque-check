// @vitest-environment node
import { globFiles } from '@sentry/bundler-plugins/core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let directory: string
let globRoot: string

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'cheque-check-sentry-glob-'))
  globRoot = directory.replaceAll('\\', '/')
  mkdirSync(join(directory, 'chunks'))
  for (const file of ['app.js', 'app.js.map', 'ignored.js']) {
    writeFileSync(join(directory, 'chunks', file), '')
  }
})

afterAll(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('@sentry/bundler-plugins patched glob compatibility', () => {
  it('discovers JavaScript and source maps while respecting ignore rules', async () => {
    const files = await globFiles(
      [`${globRoot}/**/*.js`, `${globRoot}/**/*.js.map`],
      { ignore: [`${globRoot}/**/ignored.js`] },
    )
    expect(files.map((file) => resolve(file)).sort()).toEqual(
      [
        join(directory, 'chunks', 'app.js'),
        join(directory, 'chunks', 'app.js.map'),
      ].sort(),
    )
  })

  it('excludes directories and returns no files for an unmatched pattern', async () => {
    expect(await globFiles(`${globRoot}/**/chunks`)).toEqual([])
    expect(await globFiles(`${globRoot}/**/*.css`)).toEqual([])
  })
})
