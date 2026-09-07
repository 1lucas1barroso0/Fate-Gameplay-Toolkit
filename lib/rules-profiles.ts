import { z } from "zod";
import { createId } from "@/lib/fate";
import {
  createDefaultTableConfig,
  normalizeTableConfig,
  tableConfigSchema,
  type TableConfig,
} from "@/lib/table-config";

export const MAX_RULES_PROFILES = 24;

export const rulesProfileSchema = z.object({
  id: z.string().min(1).max(100),
  config: tableConfigSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const rulesProfileCollectionSchema = z.object({
  version: z.literal(1),
  activeProfileId: z.string().min(1).max(100),
  profiles: z.array(rulesProfileSchema).min(1).max(MAX_RULES_PROFILES),
});

export type RulesProfile = z.infer<typeof rulesProfileSchema>;
export type RulesProfileCollection = z.infer<typeof rulesProfileCollectionSchema>;

export function createRulesProfile(config: TableConfig = createDefaultTableConfig()): RulesProfile {
  const now = Date.now();
  return {
    id: createId("rules"),
    config: normalizeTableConfig(config),
    createdAt: now,
    updatedAt: now,
  };
}

export function createRulesProfileCollection(config?: TableConfig): RulesProfileCollection {
  const profile = createRulesProfile(config);
  return { version: 1, activeProfileId: profile.id, profiles: [profile] };
}

export function normalizeRulesProfileCollection(input: unknown): RulesProfileCollection {
  const parsed = rulesProfileCollectionSchema.parse(input);
  const profiles = parsed.profiles.map((profile) => ({
    ...profile,
    config: normalizeTableConfig(profile.config),
  }));
  const activeProfileId = profiles.some((profile) => profile.id === parsed.activeProfileId)
    ? parsed.activeProfileId
    : profiles[0].id;
  return { version: 1, activeProfileId, profiles };
}

export function duplicateRulesProfile(profile: RulesProfile): RulesProfile {
  return createRulesProfile({
    ...structuredClone(profile.config),
    profileName: `${profile.config.profileName} — cópia`,
  });
}
