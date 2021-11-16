'use strict'

const {
  wrapSchema,
  PruneSchema,
  TransformObjectFields
} = require('@graphql-tools/wrap')

const { GraphQLObjectType } = require('graphql')

module.exports.filterSchema = async function filter (graphQLSchema, policy, authFunction, context) {
  const filterDirectiveMap = {}

  for (const [typeName, typePolicy] of Object.entries(policy)) {
    filterDirectiveMap[typeName] = {}
    for (const [fieldName, fieldPolicy] of Object.entries(typePolicy)) {
      let canShowDirectiveField = true
      try {
        // TODO parameters
        // canShowDirectiveField = await this[kApplyPolicy](policy, parent, args, context, info)
        canShowDirectiveField = await authFunction(fieldPolicy, null, {}, context, {})
        if (canShowDirectiveField instanceof Error || !canShowDirectiveField) {
          canShowDirectiveField = false
        }
      } catch (error) {
        canShowDirectiveField = false
      }

      filterDirectiveMap[typeName][fieldName] = canShowDirectiveField
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
