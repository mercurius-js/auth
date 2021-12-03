'use strict'

const {
  kApplyPolicy,
  kAuthContext,
  kAuthDirective,
  kGetAuthDirectiveAST,
  kMakeProtectedResolver,
  kMode,
  kPolicy,
  kBuildPolicy,
  kSetTypePolicy,
  kSetFieldPolicy,
  kWrapFieldResolver
} = require('./symbols')
const { MER_AUTH_ERR_FAILED_POLICY_CHECK } = require('./errors')

class Auth {
  constructor ({ applyPolicy, authContext, authDirective, mode, policy }) {
    this[kApplyPolicy] = applyPolicy
    this[kAuthContext] = authContext
    this[kAuthDirective] = authDirective
    this[kMode] = mode
    this[kPolicy] = policy
  }

  [kGetAuthDirectiveAST] (astNode) {
    if (Array.isArray(astNode.directives) && astNode.directives.length > 0) {
      const authDirective = astNode.directives.filter(directive => directive.name.value === this[kAuthDirective])
      if (authDirective.length > 0) {
        return authDirective
      }
    }
    return null
  }

  [kMakeProtectedResolver] (policy, resolverFn) {
    return async (parent, args, context, info) => {
      // Adding support for returned errors to match graphql-js resolver handling
      const result = await this[kApplyPolicy](policy, parent, args, context, info)
      if (result instanceof Error) {
        throw result
      }
      if (!result) {
        throw new MER_AUTH_ERR_FAILED_POLICY_CHECK(info.fieldName)
      }
      return resolverFn(parent, args, context, info)
    }
  }

  [kSetTypePolicy] (policy, typeName, typePolicy) {
    // This is never going to be defined because it is always the first check for a type
    policy[typeName] = { __typePolicy: typePolicy }
    return policy
  }

  [kSetFieldPolicy] (policy, typeName, fieldName, fieldPolicy) {
    const typePolicy = policy[typeName]
    if (typeof typePolicy === 'object') {
      typePolicy[fieldName] = fieldPolicy
    } else {
      policy[typeName] = {
        [fieldName]: fieldPolicy
      }
    }
    return policy
  }

  [kWrapFieldResolver] (schemaTypeField, fieldPolicy) {
    // Overwrite field resolver
    const fieldName = schemaTypeField.name
    if (typeof schemaTypeField.resolve === 'function') {
      const originalFieldResolver = schemaTypeField.resolve
      schemaTypeField.resolve = this[kMakeProtectedResolver](fieldPolicy, originalFieldResolver)
    } else {
      schemaTypeField.resolve = this[kMakeProtectedResolver](fieldPolicy, (parent) => parent[fieldName])
    }
  }

  [kBuildPolicy] (graphQLSchema) {
    const policy = {}
    const schemaTypeMap = graphQLSchema.getTypeMap()
    for (const schemaType of Object.values(schemaTypeMap)) {
      // Handle directive on type
      if (typeof schemaType.astNode !== 'undefined') {
        const authDirectiveASTForType = this[kGetAuthDirectiveAST](schemaType.astNode)
        if (authDirectiveASTForType !== null) {
          this[kSetTypePolicy](policy, schemaType.name, authDirectiveASTForType)
        }
      }
      if (typeof schemaType.getFields === 'function') {
        for (const field of Object.values(schemaType.getFields())) {
          if (typeof field.astNode !== 'undefined') {
            // Override resolvers on protected fields
            const authDirectiveASTForField = this[kGetAuthDirectiveAST](field.astNode)
            if (authDirectiveASTForField !== null) {
              this[kSetFieldPolicy](policy, schemaType.name, field.name, authDirectiveASTForField)
            }
          }
        }
      }
    }
    return policy
  }

  getPolicy (graphQLSchema) {
    if (this[kMode] === 'external') {
      return this[kPolicy] || {}
    }
    return this[kBuildPolicy](graphQLSchema)
  }

  registerAuthHandlers (graphQLSchema, policy) {
    for (const [typeName, typePolicy] of Object.entries(policy)) {
      const schemaType = graphQLSchema.getType(typeName)
      if (typeof schemaType !== 'undefined' && typeof schemaType.getFields === 'function') {
        for (let [fieldName, fieldPolicies] of Object.entries(typePolicy)) {
          // this branch of code handles both internal and external policies registration
          if (!Array.isArray(fieldPolicies)) {
            fieldPolicies = [fieldPolicies]
          }

          for (const fieldPolicy of fieldPolicies) {
            if (fieldName === '__typePolicy') {
              if (typeof schemaType.resolveReference === 'function') {
                // If type is a reference resolver, we wrap this function
                const originalResolveReference = schemaType.resolveReference
                schemaType.resolveReference = this[kMakeProtectedResolver](fieldPolicy, originalResolveReference)
              } else {
                // Wrap each field for a protected schema type
                for (const schemaTypeField of Object.values(schemaType.getFields())) {
                  this[kWrapFieldResolver](schemaTypeField, fieldPolicy)
                }
              }
            } else {
              const schemaTypeField = schemaType.getFields()[fieldName]
              if (typeof schemaTypeField !== 'undefined') {
                this[kWrapFieldResolver](schemaTypeField, fieldPolicy)
              }
            }
          }
        }
      }
    }
  }

  async authContextHook (_schema, _document, context) {
    const auth = await this[kAuthContext](context)
    const authMerge = Object.assign({}, context.auth, auth)
    Object.assign(context, { auth: authMerge })
  }
}

module.exports = Auth
