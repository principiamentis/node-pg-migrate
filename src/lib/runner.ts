import path from 'path'
import Db, { DBConnection } from './db'
import { ColumnDefinitions } from '../operations/tablesTypes'
import { Migration, loadMigrationFiles, RunMigration } from './migration'
import {
  MigrationBuilderActions,
  MigrationDirection,
  RunnerOptionClient,
  RunnerOptionUrl,
  RunnerOption,
  Logger,
} from './types'
import { createSchemalize, getMigrationTableSchema, getSchemas } from './utils'

interface MigrationVariant {
  migrations: Migration[]
  next: Migration | null
  reset: Migration
}

// Random but well-known identifier shared by all instances of node-pg-migrate
const PG_MIGRATE_LOCK_ID = 7241865325823964

const idColumn = 'id'
const nameColumn = 'name'
const runOnColumn = 'run_on'

const getMigration = (db: DBConnection, options: RunnerOption, logger: Logger, file: string) => {
  let shorthands: ColumnDefinitions = {}
  const filePath = `${options.dir}/${file}`
  // eslint-disable-next-line global-require,import/no-dynamic-require,security/detect-non-literal-require,@typescript-eslint/no-var-requires
  const actions: MigrationBuilderActions = require(path.relative(__dirname, filePath))
  shorthands = { ...shorthands, ...actions.shorthands }
  return new Migration(
    db,
    filePath,
    actions,
    options,
    {
      ...shorthands,
    },
    logger,
  )
}

const loadMigrations = async (db: DBConnection, options: RunnerOption, logger: Logger) => {
  try {
    const files = await loadMigrationFiles(options.dir)
    return {
      migrations: (
        await Promise.all(files.migrations.map(async (file) => getMigration(db, options, logger, file)))
      ).sort((m1, m2) => m1.timestamp - m2.timestamp),
      next: files.next ? await getMigration(db, options, logger, files.next) : null,
      reset: await getMigration(db, options, logger, files.reset),
    }
  } catch (err) {
    throw new Error(`Can't get migration files: ${err.stack}`)
  }
}

const lock = async (db: DBConnection): Promise<void> => {
  const [result] = await db.select(`select pg_try_advisory_lock(${PG_MIGRATE_LOCK_ID}) as "lockObtained"`)
  if (!result.lockObtained) {
    throw new Error('Another migration is already running')
  }
}

const unlock = async (db: DBConnection): Promise<void> => {
  const [result] = await db.select(`select pg_advisory_unlock(${PG_MIGRATE_LOCK_ID}) as "lockReleased"`)

  if (!result.lockReleased) {
    throw new Error('Failed to release migration lock')
  }
}

const ensureMigrationsTable = async (db: DBConnection, options: RunnerOption): Promise<void> => {
  try {
    const schema = getMigrationTableSchema(options)
    const { migrationsTable } = options
    const fullTableName = createSchemalize(
      Boolean(options.decamelize),
      true,
    )({
      schema,
      name: migrationsTable,
    })

    const migrationTables = await db.select(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${schema}' AND table_name = '${migrationsTable}'`,
    )

    if (migrationTables && migrationTables.length === 1) {
      const primaryKeyConstraints = await db.select(
        `SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = '${schema}' AND table_name = '${migrationsTable}' AND constraint_type = 'PRIMARY KEY'`,
      )
      if (!primaryKeyConstraints || primaryKeyConstraints.length !== 1) {
        await db.query(`ALTER TABLE ${fullTableName} ADD PRIMARY KEY (${idColumn})`)
      }
    } else {
      await db.query(
        `CREATE TABLE ${fullTableName} ( ${idColumn} SERIAL PRIMARY KEY, ${nameColumn} varchar(255) NOT NULL, ${runOnColumn} timestamp NOT NULL)`,
      )
    }
  } catch (err) {
    throw new Error(`Unable to ensure migrations table: ${err.stack}`)
  }
}

const getRunMigrations = async (db: DBConnection, options: RunnerOption) => {
  const schema = getMigrationTableSchema(options)
  const { migrationsTable } = options
  const fullTableName = createSchemalize(
    Boolean(options.decamelize),
    true,
  )({
    schema,
    name: migrationsTable,
  })
  return db.column(nameColumn, `SELECT ${nameColumn} FROM ${fullTableName} ORDER BY ${runOnColumn}, ${idColumn}`)
}

const getMigrationsToRun = (options: RunnerOption, runNames: string[], migrations: MigrationVariant): Migration[] => {
  console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>')
  console.log(options.file)
  console.log('##########################')
  console.log(options.fileLast)
  console.log('##########################')
  console.log(runNames)
  console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>')

  if (options.direction === 'down') {
    const downMigrations: Array<string | Migration> = runNames
      .filter((migrationName) => !options.file || options.file === migrationName)
      .map((migrationName) => migrations.migrations.find(({ name }) => name === migrationName) || migrationName)
    const toRun = downMigrations.slice(-Math.abs(options.count === undefined ? 1 : options.count)).reverse()
    const deletedMigrations = toRun.filter((migration): migration is string => typeof migration === 'string')
    if (deletedMigrations.length) {
      const deletedMigrationsStr = deletedMigrations.join(', ')
      throw new Error(`Definitions of migrations ${deletedMigrationsStr} have been deleted.`)
    }
    return toRun as Migration[]
  }
  if (options.direction === 'reset') {
    let toRun: Migration[]
    if (options.file) {
      const index = migrations.migrations.map((item) => item.name).indexOf(options.file)

      if (index < 0) {
        toRun = []
      } else {
        toRun = [migrations.reset]
      }
    } else {
      toRun = [migrations.reset]
    }
    return toRun
  }

  let upMigrations = migrations.migrations

  if (options.direction === 'use') {
    if (options.file) {
      const allMigrations = migrations.next ? [...migrations.migrations, migrations.next] : migrations.migrations

      upMigrations = allMigrations.filter(
        ({ name }) => runNames.indexOf(name) < 0 && (!options.file || options.file === name),
      )

      if (upMigrations.length) {
        const indexOfFile = allMigrations.map((item) => item.name).indexOf(options.file)
        const index = runNames.indexOf(allMigrations[indexOfFile - 1].name)

        if (index < 0) {
          throw new Error(`Not run migration "${options.file}" before previous migrations.`)
        }

        if (options.fileLast) {
          const indexOfFileLast = allMigrations.map((item) => item.name).indexOf(options.fileLast)

          if (indexOfFileLast < 0) {
            upMigrations = migrations.migrations.slice(indexOfFile, migrations.migrations.length)
          } else if (indexOfFileLast < indexOfFile) {
            throw new Error(`Wrong order of range.`)
          } else {
            upMigrations = allMigrations.slice(indexOfFile, indexOfFileLast + 1)
          }
        }
      }
    } else {
      const index = migrations.migrations.map((item) => item.name).indexOf(runNames[runNames.length - 1])
      upMigrations = migrations.migrations.slice(index + 1, migrations.migrations.length)
    }
  }

  if (options.direction === 'up') {
    if (options.file) {
      const index = migrations.migrations.map((item) => item.name).indexOf(options.file)

      if (index < 0) {
        // throw new Error(`Definitions of migrations ${options.file} not exist.`)
        upMigrations = []
      } else {
        upMigrations = migrations.migrations.slice(0, index + 1)
      }
    }
  }

  // TODO should be use snapshots for restoring of migrations
  if (options.direction === 'applySnapshot') {
    const allMigrations = migrations.next ? [...migrations.migrations, migrations.next] : migrations.migrations

    if (options.file) {
      const index = allMigrations.map((item) => item.name).indexOf(options.file)

      if (index < 0) {
        // throw new Error(`Definitions of migrations ${options.file} not exist.`)
        upMigrations = []
      } else {
        upMigrations = allMigrations.slice(0, index + 1)
      }
    } else {
      upMigrations = allMigrations
    }
  }

  // upMigrations = migrations.migrations.filter(
  //   ({ name }) => runNames.indexOf(name) < 0 && (!options.file || options.file === name),
  // )

  // console.log('########################')
  // console.log(upMigrations)
  // console.log('########################')

  return upMigrations.slice(0, Math.abs(options.count === undefined ? Infinity : options.count))
}

const checkOrder = (runNames: string[], migrations: Migration[]) => {
  const len = Math.min(runNames.length, migrations.length)
  for (let i = 0; i < len; i += 1) {
    const runName = runNames[i]
    const migrationName = migrations[i].name
    if (runName !== migrationName) {
      throw new Error(`Not run migration ${migrationName} is preceding already run migration ${runName}`)
    }
  }
}

const runMigrations = (toRun: Migration[], method: 'markAsRun' | 'apply', direction: MigrationDirection) =>
  toRun.reduce(
    (promise: Promise<unknown>, migration) => promise.then(() => migration[method](direction)),
    Promise.resolve(),
  )

export default async (options: RunnerOption): Promise<RunMigration[]> => {
  const { logger } = options
  const db = Db((options as RunnerOptionClient).dbClient || (options as RunnerOptionUrl).databaseUrl, logger)
  try {
    await db.createConnection()
    if (options.schema) {
      const schemas = getSchemas(options.schema)
      await db.query(`SET search_path TO ${schemas.map((s) => `"${s}"`).join(', ')}`)
    }
    if (options.migrationsSchema && options.createMigrationsSchema) {
      await db.query(`CREATE SCHEMA IF NOT EXISTS "${options.migrationsSchema}"`)
    }

    await ensureMigrationsTable(db, options)

    if (!options.noLock) {
      await lock(db)
    }

    const [migrations, runNames] = await Promise.all([
      loadMigrations(db, options, logger),
      getRunMigrations(db, options),
    ])

    if (options.checkOrder) {
      checkOrder(runNames, migrations.migrations)
    }

    const toRun: Migration[] = getMigrationsToRun(options, runNames, migrations)

    if (!toRun.length) {
      logger.info('No migrations to run!')
      return []
    }

    // TODO: add some fancy colors to logging
    logger.info('> Migrating files:')
    toRun.forEach((m) => {
      logger.info(`> - ${m.name}`)
    })

    if (options.fake) {
      await runMigrations(toRun, 'markAsRun', options.direction)
    } else if (options.singleTransaction) {
      await db.query('BEGIN')
      try {
        await runMigrations(toRun, 'apply', options.direction)
        await db.query('COMMIT')
      } catch (err) {
        logger.error(err)
        logger.warn('> Rolling back attempted migration ...')
        await db.query('ROLLBACK')
        throw err
      }
    } else {
      await runMigrations(toRun, 'apply', options.direction)
    }

    return toRun.map((m) => ({
      path: m.path,
      name: m.name,
      timestamp: m.timestamp,
    }))
  } finally {
    if (!options.noLock) {
      await unlock(db).catch((error) => logger.warn(error.message))
    }
    db.close()
  }
}
