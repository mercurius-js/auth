const autocannon = require('autocannon')

const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
  messages {
    title
    public
    private
  }
  adminMessages {
    title
    public
    private
  }
}`

const instance = autocannon(
  {
    url: 'http://localhost:3000/graphql',
    workers: 50,
    connections: 100,
    title: '',
    method: 'POST',
    headers: {
      'content-type': 'application/json'
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
