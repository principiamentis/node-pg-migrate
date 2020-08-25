import runner from './runner'
import { Migration } from './migration'
import { MigrationDirection, RunnerOption } from './types'

const MIGRATIONS_FILE_LANGUAGE = 'ts'

interface Utils {
  showHelp: (consoleLevel?: string) => void
  format: (format: any, ...param: any[]) => string
  createDump: (versionOfMigration: string, connectionUrl: string) => Promise<void>
  restoreDB: (versionOfMigration: string, connectionUrl: string) => Promise<void>
  compareSnapshots: (versionOfMigration: string, connectionUrl: string) => Promise<void>
}

interface LibRunnerOptions {
  migrationOption: RunnerOption
  snapshotOptions: {
    URL: string
    snapshotName: string
  }
}

export default async (argv: any, utils: Utils, config: LibRunnerOptions): Promise<void> => {
  const action = argv._.shift()
  const { migrationOption, snapshotOptions } = config
  const { dir, logger } = migrationOption
  const { URL, snapshotName } = snapshotOptions

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
  } else if (['redo', 'restore', 'apply', 'dump', 'compare'].includes(action)) {
    try {
      const dryRun = argv['dry-run']
      if (dryRun) {
        logger.info('dry run')
      }

      const singleTransaction = argv['single-transaction']
      const { fake } = argv

      const updownArg = argv._.length ? argv._[0] : null
      let numMigrations: number
      let migrationName = ''

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
          ...migrationOption,
          dryRun,
          count,
          singleTransaction,
          direction,
          fake,
          file: migrationName,
        }
      }

      if (['dump', 'compare'].includes(action) && !migrationName) {
        logger.info("'migrationName' is required.")
        utils.showHelp()
        process.exit(1)
      }

      if (action === 'redo') {
        if (migrationName === 'next') {
          await utils.restoreDB(snapshotName, URL)
          await runner(options('applyNext'))
        } else if (!migrationName) {
          await utils.restoreDB(snapshotName, URL)
        } else {
          await utils.restoreDB(migrationName.replace(/\s/g, '_'), URL)
        }
      } else if (action === 'restore') {
        await runner(options('reset'))
        await runner(options('up'))
      } else if (action === 'apply') {
        await runner(options('use'))
      } else if (action === 'dump') {
        await utils.createDump(migrationName, URL)
      } else if (action === 'compare') {
        await utils.compareSnapshots(migrationName, URL)
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
    logger.info('Invalid Action: Must be [restore|apply|create|redo|dump|compare].')
    utils.showHelp()
    process.exit(1)
  }
}
