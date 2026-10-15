'use strict'

const { test } = require('node:test')
const { compose } = require('..')
const { MER_AUTH_ERR_INVALID_OPTS } = require('../lib/errors')

const pass = async () => true
const fail = async () => false

test('compose - or grants when any check passes', async (t) => {
  t.plan(3)

  t.assert.strictEqual(await compose([fail, pass], 'or')({}), true)
  t.assert.strictEqual(await compose([pass, pass], 'or')({}), true)
  t.assert.strictEqual(await compose([fail, fail], 'or')({}), false)
})

test('compose - and grants only when every check passes', async (t) => {
  t.plan(3)

  t.assert.strictEqual(await compose([pass, pass], 'and')({}), true)
  t.assert.strictEqual(await compose([pass, fail], 'and')({}), false)
  t.assert.strictEqual(await compose([fail, fail], 'and')({}), false)
})

test('compose - defaults to the or relation', async (t) => {
  t.plan(2)

  t.assert.strictEqual(await compose([fail, pass])({}), true)
  t.assert.strictEqual(await compose([fail, fail])({}), false)
})

test('compose - an empty list of checks denies', async (t) => {
  t.plan(3)

  t.assert.strictEqual(await compose([])({}), false)
  t.assert.strictEqual(await compose([], 'or')({}), false)
  t.assert.strictEqual(await compose([], 'and')({}), false)
})

test('compose - an unknown relation combines as and', async (t) => {
  t.plan(2)

  t.assert.strictEqual(await compose([pass, fail], 'OR')({}), false)
  t.assert.strictEqual(await compose([pass, pass], 'OR')({}), true)
})

test('compose - passes the context to every check', async (t) => {
  t.plan(3)

  const context = { identity: 'user' }
  const checks = [
    (received) => {
      t.assert.deepStrictEqual(received, context)
      return false
    },
    (received) => {
      t.assert.deepStrictEqual(received, context)
      return true
    }
  ]

  t.assert.strictEqual(await compose(checks, 'or')(context), true)
})

test('compose - supports synchronous checks', async (t) => {
  t.plan(2)

  t.assert.strictEqual(await compose([() => true, () => false], 'or')({}), true)
  t.assert.strictEqual(await compose([() => true, () => false], 'and')({}), false)
})

test('compose - runs every check without short circuiting', async (t) => {
  t.plan(3)

  const calls = []
  const record = (name, granted) => async () => {
    calls.push(name)
    return granted
  }

  t.assert.strictEqual(await compose([record('a', true), record('b', false)], 'or')({}), true)
  t.assert.deepStrictEqual(calls.sort(), ['a', 'b'])

  const failure = new Error('kaboom')
  await t.assert.rejects(compose([record('c', true), async () => { throw failure }], 'or')({}), failure)
})

test('compose - compositions nest', async (t) => {
  t.plan(2)

  // a OR (b AND c)
  t.assert.strictEqual(await compose([fail, compose([pass, pass], 'and')], 'or')({}), true)
  t.assert.strictEqual(await compose([fail, compose([pass, fail], 'and')], 'or')({}), false)
})

test('compose - run: first stops at the check that decides the outcome', async (t) => {
  t.plan(6)

  const calls = []
  const record = (name, granted) => async () => {
    calls.push(name)
    return granted
  }

  // OR: the first check that passes decides.
  t.assert.strictEqual(await compose([record('a', true), record('b', true)], 'or', 'first')({}), true)
  t.assert.deepStrictEqual(calls.splice(0), ['a'])

  // AND: the first check that fails decides.
  t.assert.strictEqual(await compose([record('a', false), record('b', true)], 'and', 'first')({}), false)
  t.assert.deepStrictEqual(calls.splice(0), ['a'])

  // Otherwise every check runs and the last one decides.
  t.assert.strictEqual(await compose([record('a', false), record('b', true)], 'or', 'first')({}), true)
  t.assert.deepStrictEqual(calls.splice(0), ['a', 'b'])
})

test('compose - run: first denies an empty list of checks', async (t) => {
  t.plan(2)

  t.assert.strictEqual(await compose([], 'or', 'first')({}), false)
  t.assert.strictEqual(await compose([], 'and', 'first')({}), false)
})

test('compose - run: all is the default and runs every check', async (t) => {
  t.plan(4)

  const calls = []
  const record = (name, granted) => async () => {
    calls.push(name)
    return granted
  }

  t.assert.strictEqual(await compose([record('a', true), record('b', true)], 'or')({}), true)
  t.assert.deepStrictEqual(calls.splice(0).sort(), ['a', 'b'])

  t.assert.strictEqual(await compose([record('a', false), record('b', true)], 'and', 'all')({}), false)
  t.assert.deepStrictEqual(calls.splice(0).sort(), ['a', 'b'])
})

test('compose - requires an array of checks', async (t) => {
  t.plan(1)

  t.assert.throws(() => compose(pass), new MER_AUTH_ERR_INVALID_OPTS('checks must be an array.'))
})

test('compose - run: first evaluates every check when none is decisive', async (t) => {
  t.plan(2)

  t.assert.strictEqual(await compose([pass, pass], 'and', 'first')({}), true)
  t.assert.strictEqual(await compose([fail, fail], 'or', 'first')({}), false)
})
