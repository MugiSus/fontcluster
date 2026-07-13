# FontCluster Web

This entry builds the graph-only browser viewer from the same Solid and Three.js
source as the desktop application.

```sh
pnpm dev:web
pnpm build:web
pnpm preview:web
```

The bundled example document is used by default. To serve another public
`.fontclusterdoc`, set `VITE_FONTCLUSTER_DOCUMENT_URL` to its same-origin path
or to an absolute URL whose server permits CORS.

For an independent Vercel project, keep the project root at the repository root,
use `pnpm build:web` as the build command, and `dist-web` as the output
directory. A dedicated domain such as `fontclusterweb.mugisus.me` requires no
changes to the SolidStart landing site.
