import { z } from "zod";

export const sceneSchema = z.object({
  title: z.string().trim().max(120),
  aspects: z.array(z.string().trim().max(200)).max(12),
  opposition: z.string().trim().max(300),
  difficulty: z.number().int().min(-20).max(20),
  characters: z.array(z.object({
    id: z.string().max(100), name: z.string().trim().max(100),
    stress: z.array(z.boolean()).max(12), consequences: z.string().trim().max(500),
  })).max(24),
  objectives: z.array(z.object({
    id: z.string().max(100), name: z.string().trim().max(120),
    filled: z.number().int().min(0).max(12), segments: z.number().int().min(1).max(12),
  }).refine(item => item.filled <= item.segments)).max(12),
});
export const sceneUpdateSchema = z.object({ revision: z.number().int().nonnegative(), scene: sceneSchema.nullable() });
export type Scene = z.infer<typeof sceneSchema>;
export type SceneSnapshot = { revision: number; scene: Scene | null };
export const emptyScene = (): Scene => ({ title: "", aspects: [], opposition: "", difficulty: 2, characters: [], objectives: [] });
