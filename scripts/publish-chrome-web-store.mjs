#!/usr/bin/env node
// Chrome Web Store API v2. The v1.1 endpoints stopped accepting calls on 2026-10-15.

import { readFile } from 'node:fs/promises';

const EXTENSION_ID = 'ighgobegfcmjagombgnfhgioflinojih';
const ZIP_PATH = process.argv[2] ?? 'packages/extension/design-mode-extension.zip';
const POLL_MS = 5_000;
const POLL_BUDGET_MS = 5 * 60 * 1000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

function errorText(body) {
  if (!body) return 'empty response';
  if (typeof body.error === 'string') return [body.error, body.error_description].filter(Boolean).join(': ');
  if (body.error?.message) return body.error.message;
  return 'unrecognized error response';
}

async function google(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text.slice(0, 500) };
    }
  }
  return { ok: response.ok, status: response.status, body };
}

function inProgress(state) {
  return state === 'IN_PROGRESS' || state === 'UPLOAD_IN_PROGRESS';
}

const publisherId = requireEnv('CWS_PUBLISHER_ID');
const clientId = requireEnv('CWS_CLIENT_ID');
const clientSecret = requireEnv('CWS_CLIENT_SECRET');
const refreshToken = requireEnv('CWS_REFRESH_TOKEN');
const zip = await readFile(ZIP_PATH);

const token = await google('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }),
});

if (!token.ok || !token.body?.access_token) {
  console.error(`Chrome Web Store token refresh failed (HTTP ${token.status}): ${errorText(token.body)}`);
  if (token.body?.error === 'invalid_grant') {
    console.error(
      'The refresh token was rejected. A token created while the OAuth consent screen is in Testing expires after 7 days. Publish the consent screen and mint a new refresh token.',
    );
  }
  process.exit(1);
}

const authorization = { authorization: `Bearer ${token.body.access_token}` };
const item = `publishers/${encodeURIComponent(publisherId)}/items/${EXTENSION_ID}`;

const upload = await google(`https://chromewebstore.googleapis.com/upload/v2/${item}:upload`, {
  method: 'POST',
  headers: { ...authorization, 'content-type': 'application/octet-stream' },
  body: zip,
});

if (!upload.ok) {
  console.error(`Chrome Web Store upload failed (HTTP ${upload.status}): ${errorText(upload.body)}`);
  process.exit(1);
}

let state = upload.body?.uploadState;
console.log(
  `Upload accepted (HTTP ${upload.status}), uploadState=${state ?? 'unset'}, crxVersion=${upload.body?.crxVersion ?? 'unset'}`,
);

const deadline = Date.now() + POLL_BUDGET_MS;
while (state !== 'SUCCEEDED') {
  if (state === 'FAILED') {
    console.error('Chrome Web Store upload failed while the package was processing.');
    process.exit(1);
  }
  if (state && state !== 'NOT_FOUND' && !inProgress(state)) {
    console.error(`Chrome Web Store upload ended in unexpected state ${state}.`);
    process.exit(1);
  }
  if (Date.now() > deadline) {
    console.error('Chrome Web Store upload was still processing after 5 minutes.');
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  const status = await google(`https://chromewebstore.googleapis.com/v2/${item}:fetchStatus`, {
    headers: authorization,
  });
  if (!status.ok) {
    console.error(`Chrome Web Store fetchStatus failed (HTTP ${status.status}): ${errorText(status.body)}`);
    process.exit(1);
  }
  state = status.body?.lastAsyncUploadState;
  console.log(`lastAsyncUploadState=${state ?? 'unset'}`);
}

const publish = await google(`https://chromewebstore.googleapis.com/v2/${item}:publish`, {
  method: 'POST',
  headers: authorization,
});

if (!publish.ok) {
  console.error(`Chrome Web Store publish failed (HTTP ${publish.status}): ${errorText(publish.body)}`);
  process.exit(1);
}

console.log(
  `Submitted ${EXTENSION_ID} crxVersion=${upload.body?.crxVersion ?? 'unset'} to the Chrome Web Store for review (HTTP ${publish.status}).`,
);
