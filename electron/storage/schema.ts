import { z } from 'zod';
import type { Preferences, TaskRecord } from '../../shared/tasks';
const mode = z.enum(['video', 'audio', 'both']);
export const preferencesSchema = z.object({ mode, quality: z.enum(['best', '1080', '720']), directory: z.string().min(1) });
const quality = z.object({ id: z.string(), height: z.number(), width: z.number().optional(), label: z.string(), hasAudio: z.boolean(), needsConversion: z.boolean().optional() });
const info = z.object({ id: z.string(), platform: z.enum(['youtube', 'bilibili', 'douyin', 'xiaohongshu', 'twitter', 'tiktok', 'vimeo', 'weibo', 'generic']),
  url: z.string(), title: z.string(), uploader: z.string(), duration: z.number().optional(), qualities: z.array(quality),
  audioId: z.string().optional(), audioFromVideo: z.boolean().optional(), videoIndex: z.number().optional(), videoCount: z.number().optional(),
  hasAudio: z.boolean().optional(), captured: z.boolean().optional() });
export const taskSchema = z.object({ id: z.string().uuid(), requestId: z.string().uuid(), identity: z.string(), info, mode,
  qualityId: z.string().optional(), directory: z.string(), status: z.enum(['running', 'cancelling', 'cancelled', 'failed', 'done', 'queued', 'awaitingInput', 'interrupted']),
  phase: z.string(), percent: z.number(), detail: z.string(), outputs: z.array(z.string()), attempt: z.number(),
  accessMode: z.enum(['public', 'browser', 'session']).optional(), error: z.object({ code: z.string(), message: z.string() }).optional(),
  recovery: z.enum(['public', 'link', 'browser', 'session']), settings: preferencesSchema, createdAt: z.number(), updatedAt: z.number(),
  endedAt: z.number().optional(), revision: z.number(), workName: z.string().regex(/^\.work(?:-\d+)?$/).optional(), actual: z.object({ width: z.number().optional(), height: z.number().optional(), audio: z.boolean() }).optional() });
export const stateSchema = z.object({ schemaVersion: z.literal(1), preferences: preferencesSchema, tasks: z.array(taskSchema) });
export interface StoredState { schemaVersion: 1; preferences: Preferences; tasks: TaskRecord[] }
