'use strict'

const fp = require('fastify-plugin')

function validateOpts (opts) {
  if (typeof opts.authContext !== 'function') {
    throw new Error('opts.authContext is not a function.')
  }
  if (typeof opts.applyPolicy !== 'function') {
    throw new Error('opts.applyPolicy is not a function.')
  }
}

const plugin = fp(
  async function (app, opts) {
    validateOpts(opts)
  },
  {
    name: 'mercurius-auth',
    fastify: '>=3.x',
    dependencies: ['mercurius']
  }
)

module.exports = plugin
