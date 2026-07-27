'use strict'

const { test } = require('node:test')
const { compose } = require('..')

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
