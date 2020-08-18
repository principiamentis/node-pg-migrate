import runner from './runner'
import { Migration } from './migration'
import { MigrationDirection, RunnerOption } from './types'

const MIGRATIONS_FILE_LANGUAGE = 'ts'

interface Utils {
  showHelp: (consoleLevel?: string) => void
  format: (format: any, ...param: any[]) => string
}

export default async (argv: any, utils: Utils, config: RunnerOption): Promise<void> => {
  const action = argv._.shift()
  const { dir, logger } = config

  // logger.info('New libRunner.')

  if (action === 'create') {
    // replaces spaces with dashes - should help fix some errors
    const newMigrationName = argv._.length ? argv._.join(' ') : ''
    if (!newMigrationName) {
      logger.info("'migrationName' is required.")
      utils.showHelp()
      process.exit(1)
    }

    Migration.create(newMigrationName, dir, MIGRATIONS_FILE_LANGUAGE)
      .then((path) => {
        logger.info(utils.format('Created migration -- %s', path))
        process.exit(0)
      })
      .catch((err) => {
        logger.info(err.stack)
        process.exit(1)
      })
  } else if (action === 'up' || action === 'down' || action === 'redo' || action === 'restore') {
    try {
      const dryRun = argv['dry-run']
      if (dryRun) {
        logger.info('dry run')
      }

      const singleTransaction = argv['single-transaction']
      const { fake } = argv

      const updownArg = argv._.length ? argv._[0] : null
      let numMigrations: number
      let migrationName: string

      if (updownArg !== null) {
        // eslint-disable-next-line eqeqeq
        if (parseInt(updownArg, 10) == updownArg) {
          numMigrations = parseInt(updownArg, 10)
        } else {
          migrationName = argv._.join('-').replace(/_ /g, '-')
        }
      }

      const options = (direction: MigrationDirection, _count?: number): RunnerOption => {
        const count = _count === undefined ? numMigrations : _count
        return {
          ...config,
          dryRun,
          count,
          singleTransaction,
          direction,
          fake,
          file: migrationName,
        }
      }

      if (action === 'redo') {
        await runner(options('down'))
        await runner(options('up', Infinity))
      } else if (action === 'restore') {
        await runner(options('reset'))
        await runner(options('up'))
      } else {
        await runner(options(action))
      }

      logger.info('Migrations complete!')
      process.exit(0)
    } catch (err) {
      logger.info(err.stack)
      process.exit(1)
    }
  } else {
    logger.info('Invalid Action: Must be [up|down|restore|create|redo].')
    utils.showHelp()
    process.exit(1)
  }
}
