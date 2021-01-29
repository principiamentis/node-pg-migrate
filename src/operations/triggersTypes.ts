import { Name, Value, DropOptions } from './generalTypes'
import { CreateFunctionOptions } from './functionsTypes'

export interface TriggerOptions {
  when?: 'BEFORE' | 'AFTER' | 'INSTEAD OF'
  operation: string | string[]
  constraint?: boolean
  function?: Name
  functionParams?: readonly Value[]
  level?: 'STATEMENT' | 'ROW'
  condition?: string
  deferrable?: boolean
  deferred?: boolean
}

type CreateTriggerFn1 = (
  tableName: Name,
  triggerName: string,
  triggerOptions: TriggerOptions & DropOptions,
) => string | string[]
type CreateTriggerFn2 = (
  tableName: Name,
  triggerName: string,
  triggerOptions: TriggerOptions & CreateFunctionOptions & DropOptions,
  definition: Value,
) => string | string[]
type CreateTriggerFn = CreateTriggerFn1 | CreateTriggerFn2
export type CreateTrigger = CreateTriggerFn & { reverse: CreateTriggerFn }
export type DropTrigger = (tableName: Name, triggerName: string, dropOptions?: DropOptions) => string | string[]
type RenameTriggerFn = (tableName: Name, oldTriggerName: string, newTriggerName: string) => string | string[]
export type RenameTrigger = RenameTriggerFn & { reverse: RenameTriggerFn }
