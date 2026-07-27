'use strict'

const { compose, DEFAULT_RELATION, DEFAULT_RUN } = require('./compose')
const { MER_AUTH_ERR_INVALID_POLICY } = require('./errors')
const { validateComposedPolicyOpts } = require('./validation')

/** The directive name used when none is provided. */
const DEFAULT_AUTH_DIRECTIVE = 'auth'

/** The body of the generated `<Name>Check` input type when none is provided. */
const DEFAULT_CHECK_INPUT = 'requires: [String!]!'

const argumentValue = (directiveAST, name) =>
  directiveAST.arguments?.find(argument => argument.name.value === name)?.value

// The relation a policy carries, or `undefined` when the policy spells it in a way
// this plugin does not define. The SDL rules for directive arguments do not narrow
// an enum literal to the values of the generated enum, and an external policy value
// is plain JavaScript, so both are checked here rather than trusted.
const directiveRelation = valueNode => {
  if (valueNode.kind !== 'EnumValue') {
    return undefined
  }
  if (valueNode.value === 'OR') {
    return 'or'
  }
  return valueNode.value === 'AND' ? 'and' : undefined
}

const externalRelation = relation =>
  relation === 'and' || relation === 'or' ? relation : undefined

// A policy that spells its relation in a way this plugin does not define is an
// authoring mistake, reported as such instead of silently falling back — the way
// `@fastify/auth` rejects a relation that is neither 'or' nor 'and'.
const INVALID_DIRECTIVE_RELATION = 'relation must be either AND or OR'
const INVALID_EXTERNAL_RELATION = "relation must be either 'and' or 'or'"

// A policy that cannot be evaluated — a check `parseCheck`/`validate` rejected, a
// `prepare` failure, a relation this plugin does not define — denies with the
// reason it was rejected with. A reason that is not an `Error` must never reach the
// resolver wrapper as-is, where a truthy non-Error reads as "granted", so it is
// coerced into a coded error naming the field.
const asPolicyError = (reason, fieldName) => reason instanceof Error
  ? reason
  : new MER_AUTH_ERR_INVALID_POLICY(fieldName, String(reason))

// Denial defaults to `false` so the plugin raises its own
// MER_AUTH_ERR_FAILED_POLICY_CHECK, naming the field; `onDeny` overrides it.
const deny = (onDeny, context, info) => typeof onDeny === 'function' ? onDeny(context, info) : false

// The evaluation path both modes share: a rejected policy denies with the reason it
// was rejected for, an empty check list denies, `prepare` runs once per field, and
// the per-check verdicts are combined by the field's relation.
const evaluatePolicy = async (resolved, opts, context, info) => {
  if ('invalid' in resolved) {
    return asPolicyError(resolved.invalid, info.fieldName)
  }

  const { checks, relation } = resolved
  if (checks.length === 0) {
    return deny(opts.onDeny, context, info)
  }

  let prepared
  try {
    prepared = typeof opts.prepare === 'function' ? await opts.prepare(context) : context
  } catch (error) {
    return asPolicyError(error, info.fieldName)
  }

  // A check that throws is a check that did not pass, the way a `@fastify/auth`
  // verifier that calls `done(err)` is: its error is reported only if the
  // composition ends up denying, so one failing check cannot deny a field that
  // another check grants under OR.
  let checkError
  const predicates = checks.map(check => async value => {
    try {
      return await opts.evaluate(check, value)
    } catch (error) {
      checkError ??= error
      return false
    }
  })

  if (await compose(predicates, relation, opts.run)(prepared)) {
    return true
  }
  return checkError !== undefined
    ? asPolicyError(checkError, info.fieldName)
    : deny(opts.onDeny, context, info)
}

/**
 * Build the SDL defining a composed auth directive: the `<Name>Relation` enum,
 * the `<Name>Check` input, and the `@<name>(checks, relation)` directive itself.
 *
 * The directive is `repeatable`, so repeating it on a field ANDs the composed
 * policies — each occurrence is enforced independently by the plugin.
 */
function composeDirectiveSdl (authDirective = DEFAULT_AUTH_DIRECTIVE, checkInput = DEFAULT_CHECK_INPUT) {
  const prefix = authDirective.charAt(0).toUpperCase() + authDirective.slice(1)
  return `
  enum ${prefix}Relation {
    AND
    OR
  }

  input ${prefix}Check {
    ${checkInput}
  }

  directive @${authDirective}(
    checks: [${prefix}Check!]!
    relation: ${prefix}Relation
  ) repeatable on OBJECT | FIELD_DEFINITION
`
}

/**
 * Compose the checks of a `@<name>(checks: [...], relation: AND | OR)` directive
 * into an `applyPolicy` for `directive` mode, alongside the `sdl` that defines
 * the directive and the `authDirective` name to register the plugin with.
 *
 * The plugin ships no checks: `parseCheck` reads one check out of the directive
 * AST and `evaluate` judges it, both supplied by the application.
 */
function composeDirectivePolicy (opts) {
  validateComposedPolicyOpts(opts, 'directive')

  const {
    evaluate,
    prepare,
    parseCheck,
    onDeny,
    defaultRelation = DEFAULT_RELATION,
    run = DEFAULT_RUN,
    enabled = true,
    authDirective = DEFAULT_AUTH_DIRECTIVE,
    checkInput = DEFAULT_CHECK_INPUT
  } = opts

  // The AST of a directive is stable for the lifetime of the schema, so each
  // field's checks are parsed once rather than on every request.
  const resolvedPolicies = new WeakMap()

  async function applyPolicy (authDirectiveAST, parent, args, context, info) {
    if (!enabled) {
      return true
    }

    let resolved = resolvedPolicies.get(authDirectiveAST)
    if (resolved === undefined) {
      try {
        const checksNode = argumentValue(authDirectiveAST, 'checks')
        const relationNode = argumentValue(authDirectiveAST, 'relation')
        const relation = relationNode === undefined ? defaultRelation : directiveRelation(relationNode)
        resolved = relation === undefined
          ? { invalid: INVALID_DIRECTIVE_RELATION }
          : {
              checks: checksNode?.kind === 'ListValue' ? checksNode.values.map(parseCheck) : [],
              relation
            }
      } catch (error) {
        resolved = { invalid: error }
      }
      resolvedPolicies.set(authDirectiveAST, resolved)
    }

    return evaluatePolicy(resolved, { evaluate, prepare, onDeny, run }, context, info)
  }

  return {
    applyPolicy,
    sdl: composeDirectiveSdl(authDirective, checkInput),
    authDirective
  }
}

/**
 * Compose the checks of an `{ checks: [...], relation: 'and' | 'or' }` policy
 * value into an `applyPolicy` for `external` mode. No SDL is involved: the
 * application maps the policy values onto types and fields itself.
 */
function composeExternalPolicy (opts) {
  validateComposedPolicyOpts(opts, 'external')

  const {
    evaluate,
    prepare,
    validate,
    onDeny,
    defaultRelation = DEFAULT_RELATION,
    run = DEFAULT_RUN,
    enabled = true
  } = opts

  const resolvedPolicies = new WeakMap()

  async function applyPolicy (policy, parent, args, context, info) {
    if (!enabled) {
      return true
    }

    const memoKey = typeof policy === 'object' && policy !== null ? policy : undefined
    let resolved = memoKey !== undefined ? resolvedPolicies.get(memoKey) : undefined
    if (resolved === undefined) {
      try {
        // A mapped value without a `checks` list — a `__typePolicy` of another
        // shape, for instance — denies as an empty policy rather than throwing.
        const checks = Array.isArray(policy?.checks) ? policy.checks : []
        if (typeof validate === 'function') {
          checks.forEach(validate)
        }
        const relation = policy?.relation === undefined ? defaultRelation : externalRelation(policy.relation)
        resolved = relation === undefined
          ? { invalid: INVALID_EXTERNAL_RELATION }
          : { checks, relation }
      } catch (error) {
        resolved = { invalid: error }
      }
      if (memoKey !== undefined) {
        resolvedPolicies.set(memoKey, resolved)
      }
    }

    return evaluatePolicy(resolved, { evaluate, prepare, onDeny, run }, context, info)
  }

  return { applyPolicy }
}

module.exports = {
  composeDirectivePolicy,
  composeExternalPolicy,
  composeDirectiveSdl,
  DEFAULT_AUTH_DIRECTIVE,
  DEFAULT_CHECK_INPUT
}
