'use strict'

const {
  wrapSchema,
  PruneSchema,
  FilterTypes,
  TransformObjectFields,
  FilterInputObjectFields
} = require('@graphql-tools/wrap')
const { GraphQLObjectType } = require('graphql')

const kDirectiveGrouping = Symbol('mercurius-auth.filtering.group')

module.exports = filterIntrospectionSchema

function filterIntrospectionSchema (app, policy, { applyPolicy: policyFunction }) {
  if (!app[kDirectiveGrouping]) {
    app[kDirectiveGrouping] = []

    // the filter hook must be the last one to be executed (after all the authContextHook ones)
    app.ready(err => {
      /* istanbul ignore next */
      if (err) throw err
      app.graphql.addHook('preExecution', filterGraphQLSchemaHook.bind(app))
    })
  }

  app[kDirectiveGrouping].push({
    policy,
    policyFunction
  })
}

filterIntrospectionSchema.updatePolicy = function (app, policy, { applyPolicy: policyFunction }) {
  const storedPolicy = app[kDirectiveGrouping].find(({ policyFunction: storedPolicy }) => storedPolicy === policyFunction)
  storedPolicy.policy = policy
}

async function filterGraphQLSchemaHook (schema, document, context) {
  if (!isIntrospection(document)) {
    return
  }

  const filteredSchema = await filterSchema(schema,
    this[kDirectiveGrouping],
    context)
  return { schema: filteredSchema }
}

function isIntrospection (document) {
  for (const queryType of document.definitions) {
    if (queryType.operation !== 'query') {
      // if there is a mutation or subscription, we can skip the introspection check
      break
    }

    // if there is an introspection operation, we must filter the schema
    if (queryType.selectionSet.selections.some(sel => (
      sel.name.value === '__schema' ||
      sel.name.value === '__type'
    ))) {
      return true
    }
  }
  return false
}

async function filterSchema (graphQLSchema, policies, context) {
  const filterDirectiveMap = {}

  // each `policies` item is a directive
  let skipFiltering = true
  for (const { policy, policyFunction } of policies) {
    // each `policy` contains all the GraphQL OBJECT and FIELDS that are affected by the directive
    for (const [typeName, typePolicy] of Object.entries(policy)) {
      // different `policies` item can affect the same GraphQL OBJECT
      if (filterDirectiveMap[typeName] === undefined) {
        filterDirectiveMap[typeName] = {}
      } else if (filterDirectiveMap[typeName] === false) {
        // if the object has already been filtered, we can skip the field processing
        continue
      }

      const schemaType = graphQLSchema.getType(typeName)
      const schemaTypeFields = typeof schemaType.getFields === 'function'
        ? schemaType.getFields()
        : {}
      for (const [fieldName, fieldPolicies] of Object.entries(typePolicy)) {
        // each `fieldName` is a single GraphQL item associated with the directive

        if (filterDirectiveMap[typeName] === false || filterDirectiveMap[typeName][fieldName] === false) {
          // if we have already decided to filter out this field
          // it does not need to be checked again
          continue
        }

        let canShowDirectiveField = true
        const isObjectPolicy = fieldName === '__typePolicy'
        try {
          // https://github.com/graphql/graphql-js/blob/main/src/type/definition.ts#L974
          const info = {
            fieldName,
            fieldNodes: schemaType.astNode.fields,
            returnType: isObjectPolicy ? schemaType : schemaTypeFields[fieldName].type,
            parentType: schemaType,
            schema: graphQLSchema,
            fragments: {},
            rootValue: {},
            operation: { kind: 'OperationDefinition', operation: 'query' },
            variableValues: {}
          }

          for (const fieldPolicy of fieldPolicies) {
            // The null parameters are: https://graphql.org/learn/execution/#root-fields-resolvers
            // - parent: it is not possible know it since the resolver is not executed yet
            // - args: it is not expected that the introspection query will have arguments for the directives policies
            canShowDirectiveField = await policyFunction(fieldPolicy, null, null, context, info)
            if (canShowDirectiveField instanceof Error || !canShowDirectiveField) {
              canShowDirectiveField = false
              break
            }
          }
        } catch (error) {
          canShowDirectiveField = false
        }

        skipFiltering = skipFiltering && canShowDirectiveField
        if (canShowDirectiveField === false && isObjectPolicy) {
          // the directive is assigned to a GraphQL OBJECT so we need to filter out all the fields
          filterDirectiveMap[typeName] = canShowDirectiveField
        } else {
          filterDirectiveMap[typeName][fieldName] = canShowDirectiveField
        }
      }
    }
  }

  if (skipFiltering) {
    return graphQLSchema
  }

  return wrapSchema({
    schema: graphQLSchema,
    transforms: [
      new FilterTypes(type => {
        // should we filter out this whole type?
        return filterDirectiveMap[type.name] !== false
      }),
      new TransformObjectFields(filterField),
      new FilterInputObjectFields(filterField),
      new PruneSchema({
        skipPruning (type) {
          // skip pruning if the type is the Query or Mutation object
          return type instanceof GraphQLObjectType && (type.name === 'Query' || type.name === 'Mutation')
        }
      })
    ]
  })

  function filterField (typeName, fieldName, fieldConfig) {
    if (filterDirectiveMap[typeName] && filterDirectiveMap[typeName][fieldName] === false) {
      return null // omit the field
    }
    return undefined // unchanged
  }
}
