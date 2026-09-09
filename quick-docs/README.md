# Quick Portal documentation

The VitePress documentation site lives in this workspace-level `quick-docs` folder.
It contains the documentation migrated from `quick-portal-web/quick-docs`.

## Development

```sh
npm install
npm run docs:dev
```

## Docker development

From this directory, run `docker compose -f docker-compose.dev.yml up`.
From the monorepo root, run `docker compose up` to start the documentation
alongside the API and frontend, or `docker compose up docs` for documentation only.

Open http://localhost:5174. Source files are mounted for live reload, and
dependencies are installed in a separate container volume.

## Build and preview

```sh
npm run docs:build
npm run docs:preview
```

The static site is generated in `.vitepress/dist`.
Edit Markdown pages in `own/` and `models/`, and update navigation in
`.vitepress/config.mts`. The fee relationship diagram is rendered by `.vitepress/components/FeeDiagram.vue` using Mermaid.

The former `baskets.md` draft is consolidated into `own/cestas.md`, including
its physical-channel note. Docusaurus and VitePress example pages are omitted.
