'use strict'

const { GraphQLError, getNamedType, parse, GraphQLDirective } = require('graphql')
const {
  kApplyPolicy,
  kAuthContext,
  kAuthDirective,
  kAuthErrors,
  kApplyPolicyToSelections,
  kSetForbiddenFieldsToNull,
  kBuildCursor,
  kGetFieldAuthDirectiveAST
} = require('./symbols')
const { upperFirst } = require('./utils')

class Auth {
  constructor ({ applyPolicy, authContext, authDirective }) {
    this[kApplyPolicy] = applyPolicy
    this[kAuthContext] = authContext

    // Check typeof auth directive option and parse accordingly
    this[kAuthDirective] = typeof authDirective === 'string' ? parse(authDirective).definitions[0] : authDirective
  }

  [kGetFieldAuthDirectiveAST] (field) {
    if (field.astNode && field.astNode.directives && field.astNode.directives.length > 0) {
      const authDirective = field.astNode.directives.find(directive => {
        if (this[kAuthDirective] instanceof GraphQLDirective) {
          return directive.name.value === this[kAuthDirective].name
        }
        return directive.name.value === this[kAuthDirective].name.value
      })
      if (typeof authDirective !== 'undefined') {
        return authDirective
      }
    }
    return null
  }

  [kBuildCursor] (cursor, selection) {
    const selectionName = typeof selection.alias !== 'undefined' ? selection.alias.value : selection.name.value
    return {
      path: cursor.path.concat(selectionName)
    }
  }

  [kSetForbiddenFieldsToNull] (execution, path) {
    const [field] = path
    if (Array.isArray(execution[field])) {
      for (const idx of execution[field].keys()) {
        this[kSetForbiddenFieldsToNull](execution[field][idx], path.slice(1))
      }
    } else {
      if (typeof execution[field] === 'undefined') {
        execution[field] = null
      } else if (execution[field] !== null) {
        this[kSetForbiddenFieldsToNull](execution[field], path.slice(1))
      }
    }
  }

  async [kApplyPolicyToSelections] (fieldTypeMap, parentDefinition, definition, context, cursor) {
    const selectionsToRemove = []
    const errors = []
    const nestedSelectionsPromises = []
    await Promise.all(definition.selectionSet.selections.map(async selection => {
      // Build cursor so we know where we are
      const newCursor = this[kBuildCursor](cursor, selection)

      // Check if protected field and get field auth directive AST
      const field = fieldTypeMap[selection.name.value]
      const fieldAuthDirectiveAST = this[kGetFieldAuthDirectiveAST](field)

      // If protected field, apply policy and apply errors
      if (fieldAuthDirectiveAST !== null && !await this[kApplyPolicy](fieldAuthDirectiveAST, context, field)) {
        errors.push(new GraphQLError('auth error', selection, undefined, undefined, newCursor.path))
        selectionsToRemove.push(selection.name.value)
        return
      }

      // Continue down the tree if we have further fields to check
      const namedType = getNamedType(field.type)
      if (typeof namedType.getFields === 'function') {
        nestedSelectionsPromises.push(this[kApplyPolicyToSelections](namedType.getFields(), definition, selection, context, newCursor))
      }
    }))

    // Apply policy to nested selections
    const nestedErrors = await Promise.all(nestedSelectionsPromises)
    errors.push(...nestedErrors.flat())

    // Remove selections that failed the policy so they are not executed
    if (selectionsToRemove.length > 0) {
      if (parentDefinition !== null && selectionsToRemove.length === definition.selectionSet.selections.length) {
        parentDefinition.selectionSet.selections = parentDefinition.selectionSet.selections.filter(selection => selection.name.value !== definition.name.value)
      } else {
        definition.selectionSet.selections = definition.selectionSet.selections.filter(selection => !selectionsToRemove.includes(selection.name.value))
      }
    }
    return errors
  }

  async authContextHook (_schema, _document, context) {
    const auth = await this[kAuthContext](context)
    Object.assign(context, { auth })
  }

  async applyPolicyHook (schema, document, context) {
    context[kAuthErrors] = null
    const authErrors = []

    // Apply policy to document definitions
    await Promise.all(document.definitions.map(async definition => {
      const schemaTypeMap = schema.getType(upperFirst(definition.operation)).getFields()

      const errors = await this[kApplyPolicyToSelections](schemaTypeMap, null, definition, context, { path: [] })
      authErrors.push(...errors)
    }))

    if (authErrors.length > 0) {
      context[kAuthErrors] = authErrors
    }

    return {
      document,
      errors: authErrors
    }
  }

  async updateExecutionResultHook (execution, context) {
    if (context[kAuthErrors] !== null) {
      for (const { path } of context[kAuthErrors]) {
        if (execution.data !== null) {
          this[kSetForbiddenFieldsToNull](execution.data, path)
        }
      }
    }
  }
}

module.exports = Auth
