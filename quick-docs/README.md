# Quick Portal documentation

The VitePress documentation site lives in this workspace-level `quick-docs` folder.
It contains the documentation migrated from `quick-portal-web/quick-docs`.

## Development

```sh
npm install
npm run docs:dev
```

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
