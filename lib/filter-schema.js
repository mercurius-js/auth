'use strict'

const {
  wrapSchema,
  PruneSchema,
  TransformObjectFields
} = require('@graphql-tools/wrap')

const { GraphQLObjectType } = require('graphql')

module.exports.filterSchema = async function filter (graphQLSchema, policies, context) {
  const filterDirectiveMap = {}

  // each `policies` item is a directive
  for (const { policy, policyFunction } of policies) {
    // each `policy` contains all the GraphQL OBJECT and FIELDS that are affected by the directive
    for (const [typeName, typePolicy] of Object.entries(policy)) {
      // different `policies` item can affect the same GraphQL OBJECT
      if (!filterDirectiveMap[typeName]) {
        filterDirectiveMap[typeName] = {}
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

        filterDirectiveMap[typeName][fieldName] = canShowDirectiveField
      }
    }
  }

  return wrapSchema({
    schema: graphQLSchema,
    transforms: [
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