import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_LAUNCH_SURFACE,
  LAUNCH_SURFACE_KEY,
  LAUNCH_SURFACES,
  parseLaunchSurface,
} from './launch-surface.ts';

test('persisted key and default', () => {
  assert.equal(LAUNCH_SURFACE_KEY, 'dm-launch-surface');
  assert.equal(DEFAULT_LAUNCH_SURFACE, 'side-panel');
  assert.deepEqual([...LAUNCH_SURFACES], ['side-panel', 'floating', 'picture-in-picture']);
});

test('parseLaunchSurface accepts the three stored values', () => {
  assert.equal(parseLaunchSurface('side-panel'), 'side-panel');
  assert.equal(parseLaunchSurface('floating'), 'floating');
  assert.equal(parseLaunchSurface('picture-in-picture'), 'picture-in-picture');
});

test('parseLaunchSurface falls back for missing or junk values', () => {
  assert.equal(parseLaunchSurface(undefined), 'side-panel');
  assert.equal(parseLaunchSurface(null), 'side-panel');
  assert.equal(parseLaunchSurface(''), 'side-panel');
  assert.equal(parseLaunchSurface('sidebar'), 'side-panel');
  assert.equal(parseLaunchSurface('pip'), 'side-panel');
});
