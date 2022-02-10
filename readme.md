
@dt-esa/solution-builder
=====
A package to build solution distributables in the following formats: Docker, .zip, Dynatrace Extension, static.

A dependency map can be found [here](https://npmgraph.js.org/?q=@dt-esa/solution-builder).


## Configuration

To configure what gets added into your build output, create a `.buildignore` file in your project root like below.

```ini
# IMPORTANT: The semantics differ from normal .ignore files. 
#
# Names and patterns indicate what should be copied (i.e. whitelisted),
# but only indicate what should be ignored (i.e. blacklisted) when  
# preceded by a '!'. Anything NOT specified is effectively blacklisted.
# The rule "*: ..." constitutes the default whitelist and blacklist. 
#
# Directory names end with a '/'. For each directory specified in this file:
# - If at least one whitelisted item is specified, the global whitelist does not apply.
# - If at least one blacklisted item is specified, the global blacklist does not apply.
# - If no items are specified, the default whilelist and blacklist apply.
# Note: expressions like '**/*.js' (Javascript files anywhere) are supported.
*: *, */, !.eslintrc, !.vscode/, !node_modules/, !.git/ 
log/: README.md
tmp/: README.md
data/: README.md
client/
doc/:  !.eslintrc, !.vscode/, !node_modules/, !.git/
server/: !.eslintrc, !.vscode/, !node_modules/, !.git/
config/: *.schema.json, *.default.json, metadata.yml
/: README.md, *.service, plugin.json, plugin.py, ecosystem.config.js
```

Save this file and add the following to your package.json to bind your build triggers.
```json
{
  "name": "demo-project",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "solution-builder dev",
    "build:doc": "solution-builder doc",
    "build:dev": "solution-builder dev",
    "build:app": "solution-builder app",
    "build:solution": "solution-builder solution",
    "build:image": "docker build -t demo-project .",
    "start:build": "cd build/server && node index.js"
  },
  "dependencies": {
    "@dt-esa/solution-builder": "^1.0.3",
    "typescript": "^4.5.2"
  }
  ...
}
```


## Build CLI options
| Option | Build target | Info |
| ---      | ---           | --- | 
| `build:doc`      | Documentation | Just regenerate the documentation pages.            |
| `build:dev`      | Dependencies  | Also install dependencies to run in VSCode.         |
| `build:app`      | Application   | Compile everything needed into /build (no ZIP).     |
| `build:solution` | Solution      | Create a Dynatrace plugin as ZIP file in /dist.     |
| `build:image`    | Image         | Create a docker image in the local docker registry. |


Execute the builder with any of the run-scripts like this `npm run build:dev`.
