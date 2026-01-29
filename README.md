Mesh is a real-time data synchronisation service that seamlessly connects
devices using Node.js, Deno, Bun or the browser. Built with modern ES modules,
it features end-to-end encryption, intelligent conflict resolution, and
cross-platform compatibility.

✨ Real-time sync across all connected devices\
🔐 Built-in encryption with user authentication\
⚡ Zero configuration with smart performance optimisation\
🌐 Universal compatibility - works everywhere JavaScript runs

Try it out at [mesh.playnet.lol](https://mesh.playnet.lol)!

A build version of Mesh is also provided using
[esbuild](https://esbuild.github.io), to run in production.

Check out the [Github Wiki](https://github.com/interplaynetary/mesh/wiki) for how
to get started using the API, and for more information.

### Quick Start

- Clone this repo

#### Then using Docker

- Run `docker build -t mesh .` to build the image
- Run `docker run -p 3000:3000 -p 8765:8765 mesh` to start the server

#### Or run locally

- Run `npm install`
- Run the server with `node src/index.js`

#### Once the server is running

- Open `http://localhost:3000/examples/index.html` in the browser.
- You will then also have access to the Mesh API via the `mesh` object in
the console

### Development

- When modifying src files run: `npx prettier src --write && npm run build`
- When modifying tests run: `npx prettier test --write`
- To run the tests use: `npm run test`
