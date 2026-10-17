import type { GroupDef } from '../../lib/action'
import { e2eCleanup } from './e2e-cleanup'
import { e2eQa } from './e2e-qa'
import { reset } from './reset'
import { setup } from './setup'
import { storageMigrate } from './storage-migrate'

export const devGroup: GroupDef = {
  name: 'dev',
  title: 'Developer tooling: project setup, resets, e2e, migrations',
  description:
    'Project setup and maintenance tasks for developers (not support).',
  actions: [setup, reset, e2eQa, e2eCleanup, storageMigrate],
}
