import { Name, Value, DropOptions } from './generalTypes'

export interface FunctionParamType {
  mode?: 'IN' | 'OUT' | 'INOUT' | 'VARIADIC'
  name?: string
  type: string
  default?: Value
}

export type FunctionParam = string | FunctionParamType

export interface FunctionOptions {
  returns?: string
  language?: string
  replace?: boolean
  window?: boolean
  behavior?: 'IMMUTABLE' | 'STABLE' | 'VOLATILE' | 'LEAKPROOF'
  onNull?: boolean | 'NULL' | 'CALLED'
  parallel?: 'UNSAFE' | 'RESTRICTED' | 'SAFE'
  strict?: boolean
  security?: 'DEFINER' | 'INVOKER'
  cost?: number
  rows?: number
  comment?: string | null
  support?: string
}

export interface CreateFunctionOptions extends FunctionOptions {
  language: string
}

interface AlterFunctionOptions extends FunctionOptions {
  owner?: string
}

type CreateFunctionFn = (
  functionName: Name,
  functionParams: readonly FunctionParam[],
  functionOptions: CreateFunctionOptions & DropOptions,
  definition: Value,
) => string | string[]
export type CreateFunction = CreateFunctionFn & { reverse: CreateFunctionFn }
export type AlterFunction = (
  functionName: Name,
  functionParams: readonly FunctionParam[],
  functionOptions: AlterFunctionOptions,
) => string | string[]
export type DropFunction = (
  functionName: Name,
  functionParams: readonly FunctionParam[],
  dropOptions?: DropOptions,
) => string | string[]
type RenameFunctionFn = (
  oldFunctionName: Name,
  functionParams: readonly FunctionParam[],
  newFunctionName: Name,
) => string | string[]
export type RenameFunction = RenameFunctionFn & { reverse: RenameFunctionFn }
