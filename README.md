# Mobile Application Development - Backend

Backend API built with NestJS, TypeScript, PostgreSQL, and Sequelize.

## Requirements

- Node.js
- Yarn Classic (v1)
- PostgreSQL

## Setup

Install dependencies:

```bash
yarn install
```

Copy `.env.example` to `.env` and set your local PostgreSQL connection values. Ensure the configured database is available.

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Start the development server:

```bash
yarn start:dev
```

The server runs at `http://localhost:3000` by default.

## Commands

```bash
yarn build
yarn test
yarn lint
```
