const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const app = next({ dev: true, dir: __dirname })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  }).listen(3000, '0.0.0.0', () => {
    console.log('> Frontend ready on http://0.0.0.0:3000')
  })
})
