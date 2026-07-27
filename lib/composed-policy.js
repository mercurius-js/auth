'use strict'

const { compose, DEFAULT_RELATION } = require('./compose')
const { MER_AUTH_ERR_INVALID_POLICY } = require('./errors')
const { validateComposedPolicyOpts } = require('./validation')

/** The directive name used when none is provided. */
const DEFAULT_AUTH_DIRECTIVE = 'auth'

/** The body of the generated `<Name>Check` input type when none is provided. */
const DEFAULT_CHECK_INPUT = 'requires: [String!]!'

const argumentValue = (directiveAST, name) =>
  directiveAST.arguments?.find(argument => argument.name.value === name)?.value

// The SDL rules for directive arguments do not narrow an enum literal to the
// values this plugin knows, so map the two that are defined and treat anything
// else as unset, which falls back to `defaultRelation`.
const parseRelation = valueNode => {
  if (valueNode?.kind !== 'EnumValue') {
    return undefined
  }
  if (valueNode.value === 'OR') {
    return 'or'
  }
  return valueNode.value === 'AND' ? 'and' : undefined
}

// A `parseCheck`/`validate`/`prepare` failure signalled with a non-Error value
// must never reach the resolver wrapper as-is: a truthy non-Error is read as
// "granted" there. Coerce it so a policy that cannot be evaluated always denies.
const asPolicyError = (thrown, fieldName) => thrown instanceof Error
  ? thrown
  : new MER_AUTH_ERR_INVALID_POLICY(fieldName, String(thrown))

// Denial defaults to `false` so the plugin raises its own
// MER_AUTH_ERR_FAILED_POLICY_CHECK, naming the field; `onDeny` overrides it.
const deny = (onDeny, context, info) => typeof onDeny === 'function' ? onDeny(context, info) : false

// The evaluation path both modes share: a rejected policy denies with the error
// it was rejected with, an empty check list denies, `prepare` runs once per
// field, and the per-check verdicts are combined by the field's relation.
const evaluatePolicy = async (resolved, opts, context, info) => {
  if ('thrown' in resolved) {
    return asPolicyError(resolved.thrown, info.fieldName)
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

  const composed = compose(checks.map(check => value => opts.evaluate(check, value)), relation)
  return await composed(prepared) || deny(opts.onDeny, context, info)
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
        resolved = {
          checks: checksNode?.kind === 'ListValue' ? checksNode.values.map(parseCheck) : [],
          relation: parseRelation(argumentValue(authDirectiveAST, 'relation')) ?? defaultRelation
        }
      } catch (error) {
        resolved = { thrown: error }
      }
      resolvedPolicies.set(authDirectiveAST, resolved)
    }

    return evaluatePolicy(resolved, { evaluate, prepare, onDeny }, context, info)
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
        resolved = { checks, relation: policy?.relation ?? defaultRelation }
      } catch (error) {
        resolved = { thrown: error }
      }
      if (memoKey !== undefined) {
        resolvedPolicies.set(memoKey, resolved)
      }
    }

    return evaluatePolicy(resolved, { evaluate, prepare, onDeny }, context, info)
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
