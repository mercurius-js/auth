'use strict'

const {
  wrapSchema,
  PruneSchema,
  RemoveObjectFieldDeprecations,
  RemoveObjectFieldDirectives,
  RemoveObjectFieldsWithDeprecation,
  RemoveObjectFieldsWithDirective,
  TransformRootFields,
  TransformObjectFields,
  TransformInterfaceFields,
  TransformCompositeFields,
  TransformInputObjectFields,
  TransformEnumValues
} = require('@graphql-tools/wrap')

const { MapperKind, mapSchema } = require('@graphql-tools/utils')

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

const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLFieldConfigMap,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLInputFieldConfigMap,
  DirectiveNode,
  GraphQLFieldConfigArgumentMap,
  isNonNullType
} = require('graphql')

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
      const authDirective = astNode.directives.find(directive => directive.name.value === this[kAuthDirective])
      if (typeof authDirective !== 'undefined') {
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

  async filterDirectives (graphQLSchema, policy, context) {
    const resolverTracker = [

    ]
    for (const [typeName, typePolicy] of Object.entries(policy)) {
      const schemaType = graphQLSchema.getType(typeName)

      if (!(schemaType instanceof GraphQLObjectType)) {
        continue
      }

      const config = schemaType.toConfig()
      const policyFields = Object.keys(typePolicy)

      for (const [name, fieldConfig] of Object.entries(config.fields)) {
        if (policyFields.includes(name)) {
          const resolver = fieldConfig.resolve
          resolverTracker.push({
            typeName,
            fieldName: name,
            schemaType,
            policyAst: typePolicy[name],
            resolver
          })
        }
      }
    }
    const { request } = context.reply

    const authDirectives = resolverTracker.map(({ schemaType, fieldName, resolver }) => {
      // authDirectiveAST, parent, args, context, info
      return resolver({}, null, {}, context, {})
    })
    const resolutions = await Promise.all(authDirectives)

    const policyKeys = Object.keys(policy)
    console.log('-c-c-c-c-c-c-c-c-c-c-c-c-cc-c-c-c-c')
    return wrapSchema({
      schema: graphQLSchema,
      transforms: [
        // A modified version of the element config.
        // An array with a modified field name and new element config.
        // null to omit the element from the schema.
        // undefined to leave the element unchanged.
        // new TransformRootFields((operationName, fieldName, fieldConfig) => fieldConfig),
        new TransformObjectFields((typeName, fieldName, fieldConfig) => {
          console.log(fieldName)
        })
        // new TransformInterfaceFields((typeName, fieldName, fieldConfig) => null),
        // new TransformCompositeFields((typeName, fieldName, fieldConfig) => undefined),
        // new TransformInputObjectFields((typeName, fieldName, inputFieldConfig) => [`new_${fieldName}`, inputFieldConfig]),
        // new TransformEnumValues((typeName, enumValue, enumValueConfig) => [`NEW_${enumValue}`, enumValueConfig])

        // new RemoveObjectFieldDeprecations(/^gateway access only/),
        // new RemoveObjectFieldDirectives('deprecated', { reason: /^gateway access only/ }),
        // new RemoveObjectFieldsWithDeprecation(/^gateway access only/),
        // new RemoveObjectFieldsWithDirective('deprecated', { reason: /^gateway access only/ })
      ]
    })

    // return mapSchema(graphQLSchema, {
    //   [MapperKind.OBJECT_TYPE]: (sdlNode) => {
    //     console.log('OBJECT_TYPE', sdlNode.name)

    //     if (!policyKeys.includes(sdlNode.name)) {
    //       return sdlNode
    //     }

    //     const policyItem = policy[sdlNode.name]
    //     const policyFields = Object.keys(policyItem)

    //     // I should filter
    //     const config = sdlNode.toConfig()
    //     const newFields = {}
    //     for (const [name, fieldConfig] of Object.entries(config.fields)) {
    //       // TODO should check if fieldConfig.type is public as well
    //       if (!policyFields.includes(name)) {
    //         newFields[name] = fieldConfig
    //         continue
    //       } else {
    //         // try run the resolver!
    //         // TODO how to check async resolvers??????
    //         const resolver = fieldConfig.resolve
    //       }

    //       // TODO should manage fieldConfig.args?
    //     }

    //     if (Object.keys(newFields).length === 0) {
    //       return null
    //     }
    //     config.fields = newFields
    //     return new GraphQLObjectType(config)
    //   },
    //   [MapperKind.INPUT_OBJECT_TYPE]: (sdlNode) => {
    //     console.log('INPUT_OBJECT_TYPE', sdlNode.name)
    //     return sdlNode
    //   },
    //   [MapperKind.DIRECTIVE]: (sdlNode) => {
    //     console.log('DIRECTIVE', sdlNode.name)
    //     return sdlNode
    //   },
    //   [MapperKind.UNION_TYPE]: (sdlNode) => {
    //     console.log('UNION_TYPE', sdlNode.name)
    //     return sdlNode
    //   },
    //   [MapperKind.INTERFACE_TYPE]: (sdlNode) => {
    //     console.log('INTERFACE_TYPE', sdlNode.name)
    //     return sdlNode
    //   },
    //   [MapperKind.SCALAR_TYPE]: (sdlNode) => {
    //     console.log('SCALAR_TYPE', sdlNode.name)
    //     return sdlNode
    //   },
    //   [MapperKind.ENUM_TYPE]: (sdlNode) => {
    //     console.log('ENUM_TYPE', sdlNode.name)
    //     return sdlNode
    //   }
    // })
  }

  registerAuthHandlers (graphQLSchema, policy) {
    for (const [typeName, typePolicy] of Object.entries(policy)) {
      const schemaType = graphQLSchema.getType(typeName)
      if (typeof schemaType !== 'undefined' && typeof schemaType.getFields === 'function') {
        for (const [fieldName, fieldPolicy] of Object.entries(typePolicy)) {
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

  async authContextHook (_schema, _document, context) {
    console.log('authContextHook - ', this[kAuthDirective])
    const auth = await this[kAuthContext](context)
    Object.assign(context, { auth })
  }
}

module.exports = Auth
