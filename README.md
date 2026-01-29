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

- Run `bun install`
- Run the server with `bun run src/index.ts`

#### Once the server is running

- Open `http://localhost:3000/examples/index.html` in the browser.
- You will then also have access to the Mesh API via the `mesh` object in
the console

### Development

- When modifying src files run: `bun run build`
- When modifying tests run: `bunx prettier test --write`
- To run the tests use: `bun test`

### License & Attribution

This project is a TypeScript port of [Mesh](https://github.com/interplaynetary/mesh) by Mark Nadal with major enhancements and features.

The original code is licensed under MIT, Zlib, and Apache 2.0.
Modifications and the typescript conversion are provided under the same terms.
See [LICENSE.md](LICENSE.md) and [NOTICE](NOTICE) for details.
