'use strict'

const { parse } = require('graphql')
const { kApplyPolicy, kAuthContext, kAuthDirective, kGetAuthDirectiveAST, kMakeProtectedResolver } = require('./symbols')
const { MER_AUTH_ERR_FAILED_POLICY_CHECK } = require('./errors')

class Auth {
  constructor ({ applyPolicy, authContext, authDirective }) {
    this[kApplyPolicy] = applyPolicy
    this[kAuthContext] = authContext
    this[kAuthDirective] = parse(authDirective).definitions[0]
  }

  [kGetAuthDirectiveAST] (astNode) {
    if (Array.isArray(astNode.directives) && astNode.directives.length > 0) {
      const authDirective = astNode.directives.find(directive => directive.name.value === this[kAuthDirective].name.value)
      if (typeof authDirective !== 'undefined') {
        return authDirective
      }
    }
    return null
  }

  [kMakeProtectedResolver] (authDirectiveAST, resolverFn) {
    return async (parent, args, context, info) => {
      // Adding support for returned errors to match graphql-js resolver handling
      const result = await this[kApplyPolicy](authDirectiveAST, parent, args, context, info)
      if (result instanceof Error) {
        throw result
      }
      if (!result) {
        throw new MER_AUTH_ERR_FAILED_POLICY_CHECK(info.fieldName)
      }
      return resolverFn(parent, args, context, info)
    }
  }

  registerAuthHandlers (schema) {
    // Traverse schema types and override resolvers with auth protection where necessary
    const schemaTypeMap = schema.getTypeMap()
    for (const schemaType of Object.values(schemaTypeMap)) {
      // Handle fields on schema type
      if (typeof schemaType.getFields === 'function') {
        for (const [fieldName, field] of Object.entries(schemaType.getFields())) {
          if (typeof field.astNode !== 'undefined') {
            // Override resolvers on protected fields
            const authDirectiveASTForField = this[kGetAuthDirectiveAST](field.astNode)
            if (authDirectiveASTForField !== null) {
              if (typeof field.resolve === 'function') {
                const originalFieldResolver = field.resolve
                field.resolve = this[kMakeProtectedResolver](authDirectiveASTForField, originalFieldResolver)
              } else {
                field.resolve = this[kMakeProtectedResolver](authDirectiveASTForField, (parent) => parent[fieldName])
              }
            }
          }
        }
      }
    }
  }

  async authContextHook (_schema, _document, context) {
    const auth = await this[kAuthContext](context)
    Object.assign(context, { auth })
  }
}

module.exports = Auth
