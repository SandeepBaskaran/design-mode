import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectLaunchCapabilities, supportedLaunchSurface, pipFailureMessage } from './launch-capabilities.ts';

const windows = { windows: { create() {} } };
const pip = { documentPictureInPicture: { requestWindow() {} } };

test('Firefox and Chromium use actual callable APIs, not version or namespace presence', () => {
  assert.deepEqual(detectLaunchCapabilities(false, windows, pip), { floating: true, pictureInPicture: true });
  assert.deepEqual(detectLaunchCapabilities(false, windows, {}), { floating: true, pictureInPicture: false });
  assert.deepEqual(detectLaunchCapabilities(false, windows, { documentPictureInPicture: {} }), { floating: true, pictureInPicture: false });
  assert.deepEqual(detectLaunchCapabilities(false, {}, pip), { floating: false, pictureInPicture: false });
});

test('Safari remains Inspector-only even if APIs appear', () => {
  assert.deepEqual(detectLaunchCapabilities(true, windows, pip), { floating: false, pictureInPicture: false });
});

test('old Firefox or a disabled PiP API falls back to sidebar without overwriting preference', () => {
  const old = detectLaunchCapabilities(false, windows, {});
  assert.equal(supportedLaunchSurface('picture-in-picture', old), 'side-panel');
  assert.equal(supportedLaunchSurface('floating', old), 'floating');
  assert.equal(supportedLaunchSurface('side-panel', old), 'side-panel');
  assert.equal(supportedLaunchSurface('picture-in-picture', detectLaunchCapabilities(false, windows, pip)), 'picture-in-picture');
});

test('a gesture refusal is retryable, not persistent API incapability', () => {
  assert.match(pipFailureMessage({ name: 'NotAllowedError' }), /Click Pin on top again/);
  assert.match(pipFailureMessage({ name: 'NotSupportedError' }), /retry/);
});
