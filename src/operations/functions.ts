import { MigrationOptions } from '../types'
import { escapeValue, formatParams, makeComment } from '../utils'
import { AlterFunction, CreateFunction, DropFunction, FunctionOptions, RenameFunction } from './functionsTypes'
import { DropOptions } from './generalTypes'

export { AlterFunction, CreateFunction, DropFunction, RenameFunction }

function getOptionString(functionOptions: FunctionOptions & DropOptions) {
  const { window, behavior, onNull, strict, security, parallel, cost, rows, support } = functionOptions
  const options = []
  if (behavior) {
    options.push(behavior)
  }
  if (window) {
    options.push('WINDOW')
  }
  if (typeof onNull !== 'undefined' || typeof strict !== 'undefined') {
    options.push(`${onNull === true || onNull === 'NULL' || strict ? 'RETURNS NULL' : 'CALLED'} ON NULL INPUT`)
  }
  if (security) {
    options.push(`SECURITY ${security}`)
  }
  if (parallel) {
    options.push(`PARALLEL ${parallel}`)
  }
  if (typeof cost !== 'undefined') {
    options.push(`COST ${cost}`)
  }
  if (typeof rows !== 'undefined') {
    options.push(`ROWS ${rows}`)
  }
  if (support) {
    options.push(`SUPPORT ${support}`)
  }
  return options.map((o) => `\n  ${o}`).join('')
}

export function dropFunction(mOptions: MigrationOptions) {
  const _drop: DropFunction = (functionName, functionParams = [], options = {}) => {
    const { ifExists, cascade } = options
    const ifExistsStr = ifExists ? ' IF EXISTS' : ''
    const cascadeStr = cascade ? ' CASCADE' : ''
    const paramsStr = formatParams(functionParams, mOptions)
    const functionNameStr = mOptions.literal(functionName)
    return `DROP FUNCTION${ifExistsStr} ${functionNameStr}${paramsStr}${cascadeStr};`
  }
  return _drop
}

export function createFunction(mOptions: MigrationOptions) {
  const _create: CreateFunction = (functionName, functionParams = [], functionOptions, definition) => {
    const { replace, returns = 'void', language, comment } = functionOptions
    const replaceStr = replace ? ' OR REPLACE' : ''
    const paramsStr = formatParams(functionParams, mOptions)
    const functionNameStr = mOptions.literal(functionName)

    if (!language) {
      throw new Error(`Language for function ${functionNameStr} have to be specified`)
    }

    const stmts = [
      `CREATE${replaceStr} FUNCTION ${functionNameStr}${paramsStr}
  RETURNS ${returns}
  LANGUAGE ${language}
  AS ${escapeValue(definition)}${getOptionString(functionOptions)};`,
    ]
    if (typeof comment !== 'undefined') {
      stmts.push(makeComment('FUNCTION', functionNameStr + paramsStr, comment))
    }
    return stmts.join('\n')
  }
  _create.reverse = dropFunction(mOptions)
  return _create
}

export function alterFunction(mOptions: MigrationOptions) {
  const _alter: AlterFunction = (functionName, functionParams = [], functionOptions) => {
    const idStr = mOptions.literal(functionName) + formatParams(functionParams, mOptions)
    const { owner, comment } = functionOptions
    const options = getOptionString(functionOptions)
    const stmts = []
    if (owner) {
      stmts.push(`ALTER FUNCTION ${idStr}
  OWNER TO ${owner};`)
    }
    if (options) {
      stmts.push(`ALTER FUNCTION ${idStr}${options};`)
    }
    if (typeof comment !== 'undefined') {
      stmts.push(makeComment('FUNCTION', idStr, comment))
    }
    return stmts.join('\n')
  }
  return _alter
}

export function renameFunction(mOptions: MigrationOptions) {
  const _rename: RenameFunction = (oldName, functionParams = [], newName) => {
    const paramsStr = formatParams(functionParams, mOptions)
    let oldFn = typeof oldName === 'string' ? { name: oldName } : oldName
    const newFn = typeof newName === 'string' ? { name: newName } : newName

    const stmts = []
    if (newFn.schema && newFn.schema !== oldFn.schema) {
      const oldFunctionNameStr = mOptions.literal(oldFn)
      const newFunctionSchemaStr = mOptions.literal(newFn.schema)
      stmts.push(`ALTER FUNCTION ${oldFunctionNameStr}${paramsStr} SET SCHEMA ${newFunctionSchemaStr};`)
      oldFn = { ...oldFn, schema: newFn.schema }
    }
    if (newFn.name !== oldFn.name) {
      const oldFunctionNameStr = mOptions.literal(oldFn)
      const newFunctionNameStr = mOptions.literal(newFn.name)
      stmts.push(`ALTER FUNCTION ${oldFunctionNameStr}${paramsStr} RENAME TO ${newFunctionNameStr};`)
    }
    return stmts.join('\n')
  }
  _rename.reverse = (oldFunctionName, functionParams, newFunctionName) =>
    _rename(newFunctionName, functionParams, oldFunctionName)
  return _rename
}
