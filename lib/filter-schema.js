'use strict'

const { pruneSchema } = require('./prune-schema')

const kDirectiveGrouping = Symbol('mercurius-auth.filtering.group')

module.exports = filterIntrospectionSchema

function filterIntrospectionSchema (app, policy, { applyPolicy: policyFunction }) {
  if (!app[kDirectiveGrouping]) {
    app[kDirectiveGrouping] = []

    // the filter hook must be the last one to be executed (after all the authContextHook ones)
    app.addHook('onReady', async function () {
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
      if (typeof schemaType === 'undefined') {
        // An external policy is supplied by the application rather than read from
        // the schema, so it can name a type the schema does not have: there is
        // nothing to filter for it.
        continue
      }

      const schemaTypeFields = typeof schemaType.getFields === 'function'
        ? schemaType.getFields()
        : {}
      for (const [fieldName, policyValue] of Object.entries(typePolicy)) {
        // each `fieldName` is a single GraphQL item associated with the directive

        if (filterDirectiveMap[typeName] === false || filterDirectiveMap[typeName][fieldName] === false) {
          // if we have already decided to filter out this field
          // it does not need to be checked again
          continue
        }

        const isObjectPolicy = fieldName === '__typePolicy'
        if (!isObjectPolicy && typeof schemaTypeFields[fieldName] === 'undefined') {
          // As above: a policy can name a field the type does not have.
          continue
        }

        // A directive mode policy is the list of the field's directive ASTs, an
        // external one is the value the application mapped to the field. Both are
        // enforced the same way, all of them having to pass, as the resolvers are.
        const fieldPolicies = Array.isArray(policyValue) ? policyValue : [policyValue]

        let canShowDirectiveField = true
        // https://github.com/graphql/graphql-js/blob/main/src/type/definition.ts#L974
        const info = {
          fieldName,
          // A schema built programmatically rather than from SDL has no AST.
          fieldNodes: schemaType.astNode?.fields,
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
          try {
            canShowDirectiveField = await policyFunction(fieldPolicy, null, null, context, info)
          } catch (error) {
            // A policy that throws denies the field, as it does when the field is
            // resolved. Only the policy call is guarded: a failure anywhere else is
            // a bug in this plugin and must not read as "filter the field out".
            canShowDirectiveField = false
          }
          if (canShowDirectiveField instanceof Error || !canShowDirectiveField) {
            canShowDirectiveField = false
            break
          }
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

  return pruneSchema(graphQLSchema, filterDirectiveMap)
}
