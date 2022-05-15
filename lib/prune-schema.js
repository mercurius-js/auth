'use strict'

const {
  GraphQLSchema,
  GraphQLObjectType,
  isObjectType,
  getNamedType,
  GraphQLInputObjectType,
  isInputObjectType,
  isNonNullType,
  GraphQLList,
  GraphQLNonNull,
  isListType,
  isInterfaceType,
  GraphQLInterfaceType,
  isUnionType,
  GraphQLUnionType
} = require('graphql')

/**
 * Filters a field according to the provided map. It has the following flow:
 *  - If field is explicitly not allowed by a policy, omit
 *  - If the field type is not allowed, omit
 *  - If the type/interface implements interfaces that are not allowed, omit
 *  - Otherwise, leave field unchanged
 */
function filterField (filterDirectiveMap, type, field) {
  // If field is explicitly not allowed by a policy, omit
  if (filterDirectiveMap[type.name] && filterDirectiveMap[type.name][field.name] === false) {
    return false
  }

  // If the field type is not allowed, omit
  const namedFieldType = getNamedType(field.type)
  if (filterDirectiveMap[namedFieldType.name] === false) {
    return false
  }

  // If the field object type/interface implements interfaces that are not allowed, omit
  if (isObjectType(namedFieldType) || isInterfaceType(namedFieldType)) {
    for (const interfaceType of namedFieldType.getInterfaces()) {
      if (filterDirectiveMap[interfaceType.name] === false) {
        return false
      }
    }
  }

  return true
}

/**
 * Filters field arguments according to the filter map. It has the following flow:
 *  - If an Object type or Interface type and arguments are defined, filter the arguments
 *  - For each argument, get the argument type and check if it is allowed
 *  - If it is allowed, add to the allowed arguments map
 *  - Return the result
 */
function filterFieldArguments (filterDirectiveMap, allowedTypes, type, field) {
  // If an Object type or Interface type and arguments are defined, filter the arguments
  if ((isObjectType(type) || isInterfaceType(type)) && Array.isArray(field.args) && field.args.length > 0) {
    const filteredArgs = {}
    for (const argument of field.args) {
      // Get the argument type and check if it is allowed
      const namedType = getNamedType(argument.type)
      if (filterDirectiveMap[namedType.name] !== false) {
        // If it is allowed, add to the allowed arguments map
        filteredArgs[argument.name] = {
          ...argument,
          type: buildType(allowedTypes, argument.type)
        }
      }
    }
    return filteredArgs
  }
}

/**
 * Filter object type or interface interfaces. It has the following flow:
 *  - For each interface on the type:
 *    - Find the allowed interface in the registered types
 *    - Add it to the allowed interfaces list
 */
function filterTypeInterfaces (allowedTypes, typeConfig) {
  const interfaces = []
  for (const typeInterface of typeConfig.interfaces) {
    interfaces.push(allowedTypes[typeInterface.name])
  }
  return interfaces
}

/**
 * Recursively build a type from the registered types. It has the following flow:
 *  - If non-null type, register a GraphQL Non-Null type and build the type of this
 *  - If list type, register a GraphQL List type and build the type of this
 *  - Otherwise, return the registered type
 */
function buildType (allowedTypes, typeToBuild) {
  // If non-null type, register a GraphQL Non-Null type and build the type of this
  if (isNonNullType(typeToBuild)) {
    return new GraphQLNonNull(buildType(allowedTypes, typeToBuild.ofType))
  }

  // If list type, register a GraphQL List type and build the type of this
  if (isListType(typeToBuild)) {
    return new GraphQLList(buildType(allowedTypes, typeToBuild.ofType))
  }

  // Otherwise, return the registered type
  return allowedTypes[typeToBuild.name]
}

/**
 * Lazily build the type config. It has the following flow:
 *  - If a union type, filter the associated union types from the registered types using the filter:
 *    - Lazily construct the union types as follows:
 *      - Find associated registered union type
 *      - Omit if not allowed
 *  - Otherwise, we know the type is Object, Interface or Input Object type, so we lazily construct the fields as follows:
 *    - For each type field:
 *      - If field is allowed, construct field config
 *      - If field has arguments, filter the arguments
 *      - Build the field type
 */
function buildTypeConfig (allowedTypes, filterDirectiveMap, type) {
  const typeConfig = type.toConfig()

  // If a union type, filter the associated union types from the registered types using the filter
  if (isUnionType(type)) {
    return {
      ...typeConfig,
      // Lazily construct the union types
      types: () => {
        const unionTypes = []
        for (const unionType of typeConfig.types) {
          const allowedUnionType = allowedTypes[unionType.name]
          if (allowedUnionType && filterDirectiveMap[allowedUnionType.name] !== false) {
            unionTypes.push(allowedUnionType)
          }
        }
        return unionTypes
      }
    }
  }

  // Otherwise, we know that the type is Object, Interface or Input Object type, so we lazily construct the fields
  return {
    ...typeConfig,
    // Lazily filter types
    fields: () => {
      const prunedFields = {}
      const typeFields = Object.values(type.getFields())
      for (const field of typeFields) {
        // If field is allowed, construct field config
        if (filterField(filterDirectiveMap, type, field)) {
          prunedFields[field.name] = {
            ...typeConfig.fields[field.name],
            type: buildType(allowedTypes, field.type),
            args: filterFieldArguments(filterDirectiveMap, allowedTypes, type, field)
          }
        }
      }
      return prunedFields
    },
    interfaces: () => filterTypeInterfaces(allowedTypes, typeConfig)
  }
}

/**
 * Prune the passed filter directive map to simplify computation. It has the following flow:
 *  - For each type of the origin filter map:
 *    - If a union type, set the union and its associated types to not allowed
 *    - If input object type, and any one of the fields are set to false, mark entire input type as not allowed
 *    - If type is not allowed, set the type policy as normal if it has not already been set
 *    - Otherwise, leave the type definition as is
 */
function pruneFilterDirectiveMap (schema, originalFilterDirectiveMap) {
  const filterDirectiveMap = {}
  for (const [typeName, typePolicy] of Object.entries(originalFilterDirectiveMap)) {
    const schemaType = schema.getType(typeName)

    // If a union type, set the union and its associated types to not allowed
    if (isUnionType(schemaType) && typePolicy === false) {
      filterDirectiveMap[typeName] = typePolicy
      for (const type of schemaType.getTypes()) {
        filterDirectiveMap[type.name] = false
      }

      // If input object type, and any one of the fields are set to false, mark entire input type as not allowed
    } else if (isInputObjectType(schemaType) && Object.values(typePolicy).includes(false)) {
      filterDirectiveMap[typeName] = false

      // If type is not allowed, set the type policy as normal if it has not already been set
    } else if (filterDirectiveMap[typeName] !== false) {
      filterDirectiveMap[typeName] = typePolicy
    }
    // Otherwise, leave the type definition as is
  }
  return filterDirectiveMap
}

/**
 * Marks a type for pruning if it is an object or interface type
 * and an one of its interfaces are not allowed by the filter map.
 */
function shouldPruneTypeWithInterfaces (filterDirectiveMap, type) {
  if (isObjectType(type) || isInterfaceType(type)) {
    for (const interfaceType of type.getInterfaces()) {
      if (filterDirectiveMap[interfaceType.name] === false) {
        return true
      }
    }
  }
  return false
}

/**
 * Prunes an input GraphQL schema using a filter map. It has the following flow:
 *  - Build a list of allowed types. For each type:
 *   - If type is not allowed by filter map, prune by not adding to allowed types
 *   - Or if type is an internal type, skip
 *   -
 */
function pruneSchema (schema, originalFilterDirectiveMap) {
  const allowedTypes = {}
  const schemaTypes = Object.values(schema.getTypeMap())
  const filterDirectiveMap = pruneFilterDirectiveMap(schema, originalFilterDirectiveMap)

  // Build a list of allowed types
  for (const type of schemaTypes) {
    // If type is not allowed by filter map, prune by not adding to allowed types
    // Or if type is an internal type, skip
    if (filterDirectiveMap[type.name] === false || type.name.startsWith('__')) {
      continue
    }

    // If we have type with interfaces that is not allowed, prune by not adding to allowed types
    if (shouldPruneTypeWithInterfaces(filterDirectiveMap, type)) {
      continue
    }

    // Build the type config according to the filter map for each type
    if (isObjectType(type)) {
      allowedTypes[type.name] = new GraphQLObjectType(buildTypeConfig(allowedTypes, filterDirectiveMap, type))
    } else if (isInterfaceType(type)) {
      allowedTypes[type.name] = new GraphQLInterfaceType(buildTypeConfig(allowedTypes, filterDirectiveMap, type))
    } else if (isInputObjectType(type)) {
      allowedTypes[type.name] = new GraphQLInputObjectType(buildTypeConfig(allowedTypes, filterDirectiveMap, type))
    } else if (isUnionType(type)) {
      allowedTypes[type.name] = new GraphQLUnionType(buildTypeConfig(allowedTypes, filterDirectiveMap, type))
    } else {
      allowedTypes[type.name] = type
    }
  }

  // Build pruned schema
  const query = schema.getQueryType()
  const mutation = schema.getMutationType()
  return new GraphQLSchema({
    ...schema.toConfig(),
    query: query && allowedTypes[query.name],
    mutation: mutation && allowedTypes[mutation.name],
    // We do not support subscriptions yet
    subscription: schema.getSubscriptionType(),
    types: Object.values(allowedTypes)
  })
}

module.exports = {
  pruneSchema
}
