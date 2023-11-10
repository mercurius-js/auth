'use strict'

const { MER_AUTH_ERR_INVALID_OPTS } = require('./errors')

function validateOpts (opts) {
  // Mandatory
  if (typeof opts.applyPolicy !== 'function') {
    throw new MER_AUTH_ERR_INVALID_OPTS('opts.applyPolicy must be a function.')
  }

  // Optional
  if (typeof opts.mode !== 'undefined' && typeof opts.mode !== 'string') {
    throw new MER_AUTH_ERR_INVALID_OPTS('opts.mode must be a string.')
  }

  // External policy mode
  if (opts.mode === 'external') {
    if (typeof opts.policy !== 'undefined') {
      if (typeof opts.policy !== 'object' || opts.policy === null) {
        throw new MER_AUTH_ERR_INVALID_OPTS('opts.policy must be an object.')
      }

      for (const [typeName, typePolicy] of Object.entries(opts.policy)) {
        if (typeof typePolicy !== 'object' || typePolicy === null) {
          throw new MER_AUTH_ERR_INVALID_OPTS(`opts.policy.${typeName} must be an object.`)
        }
      }
    }

    if (opts.filterSchema === true) {
      throw new MER_AUTH_ERR_INVALID_OPTS('opts.filterSchema cannot be used when mode is external.')
    }
    // Default mode
  } else {
    // Mandatory
    if (typeof opts.authDirective !== 'string') {
      throw new MER_AUTH_ERR_INVALID_OPTS('opts.authDirective must be a string.')
    }
    // Optional
    if (typeof opts.authContext !== 'undefined' && typeof opts.authContext !== 'function') {
      throw new MER_AUTH_ERR_INVALID_OPTS('opts.authContext must be a function.')
    }
    // Optional
    if (typeof opts.outputPolicyErrors !== 'undefined' && typeof opts.outputPolicyErrors.enabled === 'boolean' && !opts.outputPolicyErrors.enabled) {
      // Value Override Check
      if (typeof opts.outputPolicyErrors.valueOverride !== 'undefined') {
        if (typeof opts.outputPolicyErrors.valueOverride !== 'string' && typeof opts.outputPolicyErrors.valueOverride !== 'function') {
          throw new MER_AUTH_ERR_INVALID_OPTS('opts.outputPolicyErrors.valueOverride must be either a string or a function that returns a string.')
        }
      }
    } else if (typeof opts.outputPolicyErrors !== 'undefined' && typeof opts.outputPolicyErrors.enabled !== 'boolean') {
      throw new MER_AUTH_ERR_INVALID_OPTS('opts.outputPolicyErrors.enabled must be a boolean')
    } else if (typeof opts.outputPolicyErrors !== 'undefined' && opts.outputPolicyErrors.enabled) {
      throw new MER_AUTH_ERR_INVALID_OPTS('opts.outputPolicyErrors.enabled must be set to false if your a doing a replacement.')
    }
  }
}

module.exports.validateOpts = validateOpts
