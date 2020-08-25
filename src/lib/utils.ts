import decamelize from 'decamelize'
import { RunnerOption } from './types'
import { Name } from '../operations/generalTypes'

const identity = <T>(v: T) => v
const quote = (str: string) => `"${str}"`

export const createSchemalize = (shouldDecamelize: boolean, shouldQuote: boolean) => {
  const transform = [shouldDecamelize ? decamelize : identity, shouldQuote ? quote : identity].reduce((acc, fn) =>
    fn === identity ? acc : (x: string) => acc(fn(x)),
  )
  return (v: Name) => {
    if (typeof v === 'object') {
      const { schema, name } = v
      return (schema ? `${transform(schema)}.` : '') + transform(name)
    }
    return transform(v)
  }
}

export const getSchemas = (schema?: string | string[]): string[] => {
  const schemas = (Array.isArray(schema) ? schema : [schema]).filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  )
  return schemas.length > 0 ? schemas : ['public']
}

export const getMigrationTableSchema = (options: RunnerOption): string =>
  options.migrationsSchema !== undefined ? options.migrationsSchema : getSchemas(options.schema)[0]
