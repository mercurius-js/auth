'use strict'

const autocannon = require('autocannon')

const query = `query {
  __type(name:"Message"){
    name
    fields{
      name
    }
  }
  __schema {
    queryType {
      name
      fields{
        name
      }
    }
  }
}`

const instance = autocannon(
  {
    url: 'http://127.0.0.1:3000/graphql',
    connections: 100,
    title: '',
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-user': 'admin'
    },
    body: JSON.stringify({ query })
  },
  (err) => {
    if (err) {
      console.error(err)
    }
  }
)

process.once('SIGINT', () => {
  instance.stop()
})

autocannon.track(instance, { renderProgressBar: true })
