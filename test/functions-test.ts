import { expect } from 'chai'
import * as Functions from '../src/operations/functions'
import { FunctionParam } from '../src/operations/functionsTypes'
import { options1, options2 } from './utils'

describe('src/operations/functions', () => {
  const params = ['integer', { name: 'arg2', mode: 'in', type: 'integer' }] as FunctionParam[]
  describe('.create', () => {
    it('throws on missing language', () => {
      expect(() =>
        Functions.createFunction(options1)({ schema: 'mySchema', name: 'f' }, [], {} as { language: string }, ''),
      ).to.throw()
    })

    it('check schemas can be used', () => {
      const args = [
        { schema: 'mySchema', name: 'f' },
        params,
        {
          returns: 'integer',
          language: 'plpgsql',
          onNull: 'CALLED',
        },
        `BEGIN
  return $1 + arg2;
END;`,
      ] as const
      const sql1 = Functions.createFunction(options1)(...args)
      const sql2 = Functions.createFunction(options2)(...args)
      expect(sql1).to.equal(
        `CREATE FUNCTION "mySchema"."f"(integer, in "arg2" integer)
  RETURNS integer
  LANGUAGE plpgsql
  AS $pga$BEGIN
  return $1 + arg2;
END;$pga$
  CALLED ON NULL INPUT;`,
      )
      expect(sql2).to.equal(
        `CREATE FUNCTION "my_schema"."f"(integer, in "arg2" integer)
  RETURNS integer
  LANGUAGE plpgsql
  AS $pga$BEGIN
  return $1 + arg2;
END;$pga$
  CALLED ON NULL INPUT;`,
      )
    })

    it('check param shorthands work', () => {
      const args = [
        { schema: 'mySchema', name: 'f' },
        ['integer', 'IN arg2 integer'],
        {
          returns: 'integer',
          language: 'sql',
          behavior: 'IMMUTABLE',
          strict: true,
        },
        `SELECT $1 + arg2;`,
      ] as const
      const sql1 = Functions.createFunction(options1)(...args)
      const sql2 = Functions.createFunction(options2)(...args)
      expect(sql1).to.equal(
        `CREATE FUNCTION "mySchema"."f"(integer, IN arg2 integer)
  RETURNS integer
  LANGUAGE sql
  AS $pga$SELECT $1 + arg2;$pga$
  IMMUTABLE
  RETURNS NULL ON NULL INPUT;`,
      )
      expect(sql2).to.equal(
        `CREATE FUNCTION "my_schema"."f"(integer, IN arg2 integer)
  RETURNS integer
  LANGUAGE sql
  AS $pga$SELECT $1 + arg2;$pga$
  IMMUTABLE
  RETURNS NULL ON NULL INPUT;`,
      )
    })

    it('check all PG12 options are supported', () => {
      const sql = Functions.createFunction(options1)(
        'myFunction',
        ['a integer', 'b real'],
        {
          returns: 'integer',
          language: 'plpgsql',
          behavior: 'STABLE',
          onNull: 'NULL',
          security: 'DEFINER',
          parallel: 'RESTRICTED',
          cost: 0,
          rows: 7,
        },
        'blah-blubb',
      )
      expect(sql).to.equal(
        `CREATE FUNCTION "myFunction"(a integer, b real)
  RETURNS integer
  LANGUAGE plpgsql
  AS $pga$blah-blubb$pga$
  STABLE
  RETURNS NULL ON NULL INPUT
  SECURITY DEFINER
  PARALLEL RESTRICTED
  COST 0
  ROWS 7;`,
      )
    })

    it('check if comments can be created', () => {
      const args = [
        { schema: 'mySchema', name: 'otherFunction' },
        ['a integer', 'b integer'],
        {
          returns: 'integer',
          language: 'sql',
          replace: true,
          behavior: 'IMMUTABLE',
          comment: `it does addition\nwith special characters ("')!`,
        },
        `SELECT a + b;`,
      ] as const
      const sql1 = Functions.createFunction(options1)(...args)
      const sql2 = Functions.createFunction(options2)(...args)
      expect(sql1).to.equal(
        `CREATE OR REPLACE FUNCTION "mySchema"."otherFunction"(a integer, b integer)
  RETURNS integer
  LANGUAGE sql
  AS $pga$SELECT a + b;$pga$
  IMMUTABLE;
COMMENT ON FUNCTION "mySchema"."otherFunction"(a integer, b integer) IS $pga$it does addition
with special characters ("')!$pga$;`,
      )
      expect(sql2).to.equal(
        `CREATE OR REPLACE FUNCTION "my_schema"."other_function"(a integer, b integer)
  RETURNS integer
  LANGUAGE sql
  AS $pga$SELECT a + b;$pga$
  IMMUTABLE;
COMMENT ON FUNCTION "my_schema"."other_function"(a integer, b integer) IS $pga$it does addition
with special characters ("')!$pga$;`,
      )
    })
  })

  describe('.alter', () => {
    it('can alter function options', () => {
      const args = [
        'myFunction',
        ['integer', 'real'],
        {
          behavior: 'VOLATILE',
          onNull: 'CALLED',
          security: 'INVOKER',
          parallel: 'UNSAFE',
          cost: 1000,
          rows: 1,
        },
      ] as const
      const sql1 = Functions.alterFunction(options1)(...args)
      const sql2 = Functions.alterFunction(options2)(...args)
      expect(sql1).to.equal(
        `ALTER FUNCTION "myFunction"(integer, real)
  VOLATILE
  CALLED ON NULL INPUT
  SECURITY INVOKER
  PARALLEL UNSAFE
  COST 1000
  ROWS 1;`,
      )
      expect(sql2).to.equal(
        `ALTER FUNCTION "my_function"(integer, real)
  VOLATILE
  CALLED ON NULL INPUT
  SECURITY INVOKER
  PARALLEL UNSAFE
  COST 1000
  ROWS 1;`,
      )
    })

    it('can alter the owner', () => {
      const sql1 = Functions.alterFunction(options1)('myFunction', ['something'], {
        owner: 'newOwner',
        behavior: 'VOLATILE',
        security: 'DEFINER',
      })
      expect(sql1).to.equal(
        `ALTER FUNCTION "myFunction"(something)
  OWNER TO newOwner;
ALTER FUNCTION "myFunction"(something)
  VOLATILE
  SECURITY DEFINER;`,
      )
      const sql2 = Functions.alterFunction(options2)('myFunction', ['something', 'custom'], {
        owner: 'CURRENT_USER',
      })
      expect(sql2).to.equal(
        `ALTER FUNCTION "my_function"(something, custom)
  OWNER TO CURRENT_USER;`,
      )
    })

    it('can alter the comment', () => {
      const sql1 = Functions.alterFunction(options1)('myFunction', ['something'], {
        strict: false,
        comment: 'deals with null values',
      })
      expect(sql1).to.equal(
        `ALTER FUNCTION "myFunction"(something)
  CALLED ON NULL INPUT;
COMMENT ON FUNCTION "myFunction"(something) IS $pga$deals with null values$pga$;`,
      )
      const sql2 = Functions.alterFunction(options2)('myFunction', ['something', 'custom'], {
        comment: null,
      })
      expect(sql2).to.equal(`COMMENT ON FUNCTION "my_function"(something, custom) IS NULL;`)
    })
  })

  describe('.rename', () => {
    it('handles all input formats', () => {
      {
        const args = [
          { schema: 'mySchema', name: 'myF' },
          ['integer', 'custom'],
          { schema: 'mySchema', name: 'myG' },
        ] as const
        const sql1 = Functions.renameFunction(options1)(...args)
        const sql2 = Functions.renameFunction(options2)(...args)
        expect(sql1).to.equal('ALTER FUNCTION "mySchema"."myF"(integer, custom) RENAME TO "myG";')
        expect(sql2).to.equal('ALTER FUNCTION "my_schema"."my_f"(integer, custom) RENAME TO "my_g";')
      }
      {
        const sql = Functions.renameFunction(options2)(
          { schema: 'my_schema', name: 'my_f' },
          ['integer', 'custom'],
          'my_g',
        )
        expect(sql).to.equal('ALTER FUNCTION "my_schema"."my_f"(integer, custom) RENAME TO "my_g";')
      }
      {
        const args = ['myF', ['integer', 'custom'], 'myG'] as const
        const sql1 = Functions.renameFunction(options1)(...args)
        const sql2 = Functions.renameFunction(options2)(...args)
        expect(sql1).to.equal('ALTER FUNCTION "myF"(integer, custom) RENAME TO "myG";')
        expect(sql2).to.equal('ALTER FUNCTION "my_f"(integer, custom) RENAME TO "my_g";')
      }
    })

    it('can change schemas', () => {
      const args = [
        { schema: 'oldSchema', name: 'myF' },
        ['integer', 'custom'],
        { schema: 'newSchema', name: 'myF' },
      ] as const
      const sql1 = Functions.renameFunction(options1)(...args)
      const sql2 = Functions.renameFunction(options2)(...args)
      expect(sql1).to.equal('ALTER FUNCTION "oldSchema"."myF"(integer, custom) SET SCHEMA "newSchema";')
      expect(sql2).to.equal('ALTER FUNCTION "old_schema"."my_f"(integer, custom) SET SCHEMA "new_schema";')
    })

    it('can change both schema and name', () => {
      const args = [
        { schema: 'oldSchema', name: 'myF' },
        ['integer', 'custom'],
        { schema: 'newSchema', name: 'myG' },
      ] as const
      const sql1 = Functions.renameFunction(options1)(...args)
      const sql2 = Functions.renameFunction(options2)(...args)
      expect(sql1).to.equal(
        `ALTER FUNCTION "oldSchema"."myF"(integer, custom) SET SCHEMA "newSchema";
ALTER FUNCTION "newSchema"."myF"(integer, custom) RENAME TO "myG";`,
      )
      expect(sql2).to.equal(
        `ALTER FUNCTION "old_schema"."my_f"(integer, custom) SET SCHEMA "new_schema";
ALTER FUNCTION "new_schema"."my_f"(integer, custom) RENAME TO "my_g";`,
      )
    })
  })
})
