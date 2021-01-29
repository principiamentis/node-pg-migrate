import { expect } from 'chai'
import * as Policies from '../src/operations/policies'
import { options1, options2 } from './utils'

describe('src/operations/policies', () => {
  describe('.create', () => {
    it('check defaults', () => {
      const args = [{ schema: 'mySchema', name: 'myTableName' }, 'getIn'] as const
      const sql1 = Policies.createPolicy(options1)(...args)
      const sql2 = Policies.createPolicy(options2)(...args)
      expect(sql1).to.equal('CREATE POLICY "getIn" ON "mySchema"."myTableName" FOR ALL TO PUBLIC;')
      expect(sql2).to.equal('CREATE POLICY "get_in" ON "my_schema"."my_table_name" FOR ALL TO PUBLIC;')
    })
    it('can be restrictive', () => {
      const args = [{ schema: 'my_schema', name: 'my_tablename' }, 'get_out', { restrictive: true }] as const
      const sql1 = Policies.createPolicy(options1)(...args)
      const sql2 = Policies.createPolicy(options2)(...args)
      expect(sql1).to.equal('CREATE POLICY "get_out" ON "my_schema"."my_tablename" AS RESTRICTIVE FOR ALL TO PUBLIC;')
      expect(sql2).to.equal('CREATE POLICY "get_out" ON "my_schema"."my_tablename" AS RESTRICTIVE FOR ALL TO PUBLIC;')
    })
    it('supports all options', () => {
      const args = [
        'my_tablename',
        'my_allowance',
        {
          restrictive: false,
          command: 'UPDATE',
          role: ['SESSION_USER', 'the_user'],
          using: 'crazy_expression',
          check: 'curious.function(column)',
          comment: 'is a sample',
        },
      ] as const
      const sql = Policies.createPolicy(options1)(...args)
      expect(sql).to.equal(
        `CREATE POLICY "my_allowance" ON "my_tablename" AS PERMISSIVE FOR UPDATE TO SESSION_USER, the_user USING (crazy_expression) WITH CHECK (curious.function(column));
COMMENT ON POLICY "my_allowance" ON "my_tablename" IS $pga$is a sample$pga$;`,
      )
    })
  })

  describe('.alter', () => {
    it('can set role', () => {
      const args = [
        'myTablename',
        'myAllowance',
        {
          role: 'PUBLIC',
        },
      ] as const
      const sql = Policies.alterPolicy(options2)(...args)
      expect(sql).to.equal('ALTER POLICY "my_allowance" ON "my_tablename" TO PUBLIC;')
    })

    it('can remove comment', () => {
      const sql = Policies.alterPolicy(options1)({ schema: 'mySchema', name: 'myTableName' }, 'getIn', {
        comment: null,
      })
      expect(sql).to.equal('COMMENT ON POLICY "getIn" ON "mySchema"."myTableName" IS NULL;')
    })
  })
})
