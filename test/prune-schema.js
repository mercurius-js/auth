'use strict'

const { describe, test } = require('node:test')
const { buildSchema, printSchema, parse } = require('graphql')
const { pruneSchema } = require('../lib/prune-schema')

describe('pruneSchema', async (t) => {
  const tests = [
    {
      name: 'should prune object types from the schema',
      schema: `
        type Author {
          name: String
        }

        extend type Author {
          id: ID
        }

        type Message {
          name: String
          author: Author
        }`,
      filterDirectiveMap: {
        Message: false
      },
      result: `type Author {
  name: String
  id: ID
}`
    },
    {
      name: 'should not prune query types from the schema',
      schema: `
        type User {
          name: String
        }

        type Query {
          me: User
        }`,
      filterDirectiveMap: {
        User: false
      },
      result: 'type Query'
    },
    {
      name: 'should not prune mutation types from the schema',
      schema: `
        type User {
          name: String
        }

        type Mutation {
          register(name: String): User
        }`,
      filterDirectiveMap: {
        User: false
      },
      result: 'type Mutation'
    },
    {
      name: 'should prune object types and all usages from the schema',
      schema: `
        type Message {
          name: String
        }

        type User {
          name: String
          messages: [Message]
        }

        type Query {
          message: Message
        }
      `,
      filterDirectiveMap: {
        Message: false
      },
      result: `type User {
  name: String
}

type Query`
    },
    {
      name: 'should prune field types from the schema',
      schema: `
        type Message {
          name: String
        }

        type User {
          name: String
          age: Int
          message: Message
        }

        type Query {
          message: Message
        }
      `,
      filterDirectiveMap: {
        Message: {
          name: false
        },
        User: {
          age: false
        }
      },
      result: `type Message

type User {
  name: String
  message: Message
}

type Query {
  message: Message
}`
    },
    {
      name: 'should prune list types from the schema',
      schema: `
        type Message {
          names: [String]
        }

        type User {
          name: String
          ages: [Int]
          hiddenMessages: [Message]
          messages: [Message]
        }

        type Query {
          messages: [Message]
        }
      `,
      filterDirectiveMap: {
        Message: {
          names: false
        },
        User: {
          ages: false,
          hiddenMessages: false
        }
      },
      result: `type Message

type User {
  name: String
  messages: [Message]
}

type Query {
  messages: [Message]
}`
    },
    {
      name: 'should prune non-nullable types from the schema',
      schema: `
        type Message {
          name: String!
        }

        type User {
          name: String!
          ages: [Int!]
          hiddenMessages: [Message!]!
          message: Message!
          messages: [Message!]
          mandatoryMessages: [Message!]!
        }

        type Query {
          messages: [Message!]
          mandatoryMessages: [Message!]!
        }
      `,
      filterDirectiveMap: {
        Message: {
          name: false
        },
        User: {
          ages: false,
          hiddenMessages: false
        }
      },
      result: `type Message

type User {
  name: String!
  message: Message!
  messages: [Message!]
  mandatoryMessages: [Message!]!
}

type Query {
  messages: [Message!]
  mandatoryMessages: [Message!]!
}`
    },
    {
      name: 'should prune interface types from the schema',
      schema: `
        interface BasicMessage {
          message: String
        }

        interface Node {
          id: ID
        }

        type Message implements Node & BasicMessage {
          id: ID
          title: String
          message: String
        }

        type User implements Node {
          id: ID
          messages: Message
        }

        type Query {
          publicMessages(org: String): [Message!]
          me: User
        }
      `,
      filterDirectiveMap: {
        BasicMessage: false
      },
      result: `interface Node {
  id: ID
}

type User implements Node {
  id: ID
}

type Query {
  me: User
}`
    },
    {
      name: 'should prune types within a union from the schema',
      schema: `
        type Message {
          title: String!
          password: String
        }

        type SimpleMessage {
          title: String!
          message: String
        }

        union MessageUnion = Message | SimpleMessage

        type Query {
          publicMessages(org: String): [MessageUnion!]
        }`,
      filterDirectiveMap: {
        MessageUnion: false,
        Message: {
          password: false
        }
      },
      result: 'type Query'
    },
    {
      name: 'should prune input types from the schema',
      schema: `
        input MessageInput {
          message: String
          password: String
        }

        input MessageInputFilters {
          id: ID
        }

        type Query {
          message(id: ID!): [String!]
          publicMessages(org: MessageInput): [String!]
          publicMessagesWithFilters(org: MessageInput!, filters: MessageInputFilters): [String!]
        }
      `,
      filterDirectiveMap: {
        MessageInput: false
      },
      result: `input MessageInputFilters {
  id: ID
}

type Query {
  message(id: ID!): [String!]
  publicMessages: [String!]
  publicMessagesWithFilters(filters: MessageInputFilters): [String!]
}`
    },
    {
      name: 'should prune input types from the schema when input type fields are not allowed',
      schema: `
        input MessageInput {
          message: String
          password: String
        }

        input MessageInputFilters {
          id: ID
        }

        type Query {
          message(id: ID!): [String!]
          publicMessages(org: MessageInput): [String!]
          publicMessagesWithFilters(org: MessageInput!, filters: MessageInputFilters): [String!]
        }`,
      filterDirectiveMap: {
        MessageInput: {
          password: false
        }
      },
      result: `input MessageInputFilters {
  id: ID
}

type Query {
  message(id: ID!): [String!]
  publicMessages: [String!]
  publicMessagesWithFilters(filters: MessageInputFilters): [String!]
}`
    },
    {
      name: 'should prune unions and types with partially available fields from the schema',
      schema: `
        type AdminMessage {
          title: String!
          message: String
          password: String
        }

        type SimpleMessage {
          title: String!
          message: String
        }
      
        union MessageUnion = AdminMessage | SimpleMessage
      
        type Query {
          messages(org: String): [MessageUnion!]
        }`,
      filterDirectiveMap: {
        AdminMessage: false,
        SimpleMessage: { message: false }
      },
      result: `type SimpleMessage {
  title: String!
}

union MessageUnion = SimpleMessage

type Query {
  messages(org: String): [MessageUnion!]
}`
    }
  ]

  for (const { name, schema, filterDirectiveMap, result } of tests) {
    test(name, (t) => {
      const prunedSchema = pruneSchema(buildSchema(schema), filterDirectiveMap)
      const schemaString = printSchema(prunedSchema)
      t.assert.strictEqual(schemaString, result)
      t.assert.doesNotThrow(() => parse(schemaString))
    })
  }
})
