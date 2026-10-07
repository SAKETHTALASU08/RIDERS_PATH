import React from 'react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../apps/web/src/App';

const indexPath = resolve(process.cwd(), 'dist/web/index.html');
const html = readFileSync(indexPath, 'utf8');
const markup = renderToString(
  <MemoryRouter initialEntries={['/']}>
    <AppRoutes />
  </MemoryRouter>
);
const prerendered = html.replace(
  '<div id="root"></div>',
  `<div id="root" data-prerendered="true">${markup}</div>`
);

if (prerendered === html) throw new Error('Could not find the app root in dist/index.html');
writeFileSync(indexPath, prerendered);
console.log('Prerendered landing page to dist/web/index.html');
