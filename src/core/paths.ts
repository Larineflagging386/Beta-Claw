/**
 * Central path constants for all user-generated data.
 * Everything the agent creates lives under WORKSPACE unless the user
 * explicitly specifies another location.
 */
import path from 'node:path';

export const WORKSPACE       = path.resolve('.workspace');
export const DB_PATH         = path.join(WORKSPACE, 'db', 'microclaw.db');
export const GROUPS_DIR      = path.join(WORKSPACE, 'groups');
export const IMAGES_DIR      = path.join(WORKSPACE, 'images');
export const DOWNLOADS_DIR   = path.join(WORKSPACE, 'downloads');
export const WORK_DIR        = path.join(WORKSPACE, 'work');
export const EXPORTS_DIR     = path.join(WORKSPACE, 'exports');
export const MEMORY_FILENAME = 'memory.md';
export const SOUL_FILENAME   = 'soul.md';
