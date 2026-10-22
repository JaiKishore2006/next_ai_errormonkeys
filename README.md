# Shelf Shuffle

An interactive warehouse digital twin that turns product
slotting optimisation into a warehouse-layout game.

## Problem

Warehouse pickers may travel unnecessary distances when
frequently ordered products are stored far apart.

## Solution

Shelf Shuffle lets users rearrange product locations, replay
orders and compare the resulting warehouse travel metrics.

## Architecture

The data pipeline generates JSON datasets. The optimisation
engine evaluates assignments and routes. The scene visualises
the warehouse, while the UI provides game rules and metrics.
Vercel hosts the frontend.

## Tech Stack

- JavaScript
- Vite
- Three.js
- CSS
- Git and GitHub
- Vercel

## Setup

```bash
npm install
npm run dev
```

The data pipeline and any additional dependencies will be
documented when their implementations are integrated.

## Deployment URL

[https://nextaierrormonkeys.vercel.app](https://nextaierrormonkeys.vercel.app)

## Data Attribution and Licence

Document the actual dataset source, attribution and applicable
licence before publishing.

## AI Tools Declaration

Declare the AI coding and assistance tools actually used.

## Team

Document all three team members and their responsibilities.

## Development Log

See [DEV_LOG.md](./DEV_LOG.md).
