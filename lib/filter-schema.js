'use strict'

const {
  wrapSchema,
  PruneSchema,
  FilterTypes,
  TransformObjectFields
} = require('@graphql-tools/wrap')

const kDirectiveNamespace = Symbol('mercurius-auth.namespace')

const { GraphQLObjectType } = require('graphql')

module.exports = function filterIntrospectionSchema (app, policy, { namespace, applyPolicy: policyFunction }) {
  if (!app[kDirectiveNamespace]) {
    app[kDirectiveNamespace] = {}

    // the filter hook must be the last one to be executed (after all the authContextHook ones)
    app.ready(err => {
      /* istanbul ignore next */
      if (err) throw err
      app.graphql.addHook('preExecution', filterGraphQLSchemaHook(namespace).bind(app))
    })
  }

  if (app[kDirectiveNamespace][namespace]) {
    app[kDirectiveNamespace][namespace].push({
      policy,
      policyFunction
    })
  } else {
    app[kDirectiveNamespace][namespace] = [{
      policy,
      policyFunction
    }]
  }
}

function filterGraphQLSchemaHook (namespace) {
  return async function filterHook (schema, document, context) {
    if (!isIntrospection(document)) {
      return
    }

    const filteredSchema = await filterSchema(schema,
      this[kDirectiveNamespace][namespace],
      context)

    return {
      schema: filteredSchema
    }
  }
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

      for (const [fieldName, fieldPolicy] of Object.entries(typePolicy)) {
        // each `fieldName` is a single GraphQL item associated with the directive

        if (filterDirectiveMap[typeName][fieldName] === false) {
          // if we have already decided to filter out this field
          // it does not need to be checked again
          continue
        }

        let canShowDirectiveField = true
        try {
          // TODO parameters
          // canShowDirectiveField = await this[kApplyPolicy](policy, parent, args, context, info)
          canShowDirectiveField = await policyFunction(fieldPolicy, null, {}, context, {})
          if (canShowDirectiveField instanceof Error || !canShowDirectiveField) {
            canShowDirectiveField = false
          }
        } catch (error) {
          canShowDirectiveField = false
        }

        if (canShowDirectiveField === false && fieldName === '__typePolicy') {
          // the directive is assigned to a GraphQL OBJECT so we need to filter out all the fields
          filterDirectiveMap[typeName] = canShowDirectiveField
        } else {
          filterDirectiveMap[typeName][fieldName] = canShowDirectiveField
        }
      }
    }
  }

  return wrapSchema({
    schema: graphQLSchema,
    transforms: [
      new FilterTypes(type => {
        // should we filter out this whole type?
        return filterDirectiveMap[type.name] !== false
      }),
      new TransformObjectFields((typeName, fieldName, fieldConfig) => {
        if (filterDirectiveMap[typeName] && filterDirectiveMap[typeName][fieldName] === false) {
          return null // omit the field
        }
        return undefined // unchanged
      }),
      new PruneSchema({
        skipPruning (type) {
          // skip pruning if the type is the Query or Mutation object
          return type instanceof GraphQLObjectType && (type.name === 'Query' || type.name === 'Mutation')
        }
      })
    ]
  })
}
