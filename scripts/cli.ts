import { pathToFileURL } from 'node:url'
import { Command, CommanderError, Option } from 'commander'
import { accountGroup } from './commands/account'
import { devGroup } from './commands/dev'
import { opsGroup } from './commands/ops'
import { paymentGroup } from './commands/payment'
import { premiumGroup } from './commands/premium'
import { quotaGroup } from './commands/quota'
import { userGroup } from './commands/user'
import { voiceGroup } from './commands/voice'
import { runHub } from './hub'
import { registerGroups, reportError, type GroupDef } from './lib/action'
import { createContext, type GlobalOptions } from './lib/context'
import { ENV_NAMES } from './lib/env'
import { EXIT_CODES } from './lib/errors'
import { Prompter } from './lib/prompts'
import { Ui } from './lib/ui'

export const GROUPS: GroupDef[] = [
  userGroup,
  premiumGroup,
  quotaGroup,
  voiceGroup,
  paymentGroup,
  accountGroup,
  opsGroup,
  devGroup,
]

export function buildProgram(): Command {
  const program = new Command('ops')
    .description(
      'Cheque Check support & ops CLI. Run with no command for the interactive menu.',
    )
    .addOption(
      new Option('--env <name>', 'Target environment (default: local)').choices(
        [...ENV_NAMES, 'production'],
      ),
    )
    .option(
      '--json',
      'Machine-readable output on stdout (implies non-interactive)',
    )
    .option('--dry-run', 'Preview changes without applying them')
    .option('-y, --yes', 'Skip the confirmation prompt (non-production only)')
    .option(
      '--operator <email>',
      'Who is making the change (default: git user.email)',
    )
    .option('--reason <text>', 'Why; stored in the audit log')
    .option(
      '--confirm-ref <project_ref>',
      'Production only: the project ref, to confirm writes non-interactively',
    )
    .option('--verbose', 'Show debug output and stack traces')
    .showHelpAfterError('(add --help for usage)')
    .exitOverride()
    .addHelpText(
      'after',
      `
Examples:
  $ npm run ops                                        # interactive menu
  $ npm run ops -- user show --user priya@example.com
  $ npm run ops -- premium grant-lifetime --user priya@example.com --reason "Support #123"
  $ npm run ops -- quota topup --user priya@example.com --kind voice --env prod
  $ npm run ops -- voice trigger-business --user priya@example.com
  $ npm run ops -- ops doctor --env qa

Exit codes: 0 ok · 1 error · 2 usage · 3 cancelled · 4 not found · 5 refused by a safety guard`,
    )

  registerGroups(program, GROUPS)

  program.action(async (options: GlobalOptions) => {
    const interactive =
      Boolean(process.stdin.isTTY && process.stderr.isTTY) && !options.json
    if (!interactive) {
      program.outputHelp()
      process.exitCode = EXIT_CODES.USAGE
      return
    }
    await runHub(options, {
      groups: GROUPS,
      prompt: new Prompter(true),
      createContext,
    })
  })
  return program
}

export async function main(argv = process.argv): Promise<void> {
  const program = buildProgram()
  try {
    await program.parseAsync(argv)
  } catch (error) {
    if (error instanceof CommanderError) {
      // Commander has already printed help/version or the usage error.
      process.exitCode = error.exitCode === 0 ? EXIT_CODES.OK : EXIT_CODES.USAGE
      return
    }
    const options = program.opts<GlobalOptions>()
    process.exitCode = reportError(
      new Ui({
        json: Boolean(options.json),
        verbose: Boolean(options.verbose),
      }),
      error,
    )
  }
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void main()
}
