import { z } from "zod";

export const SKILLS = [
  { id: "academics", pt: "Conhecimentos", en: "Academics" },
  { id: "athletics", pt: "Atletismo", en: "Athletics" },
  { id: "burglary", pt: "Roubo", en: "Burglary" },
  { id: "contacts", pt: "Contatos", en: "Contacts" },
  { id: "crafts", pt: "Ofícios", en: "Crafts" },
  { id: "deceive", pt: "Enganar", en: "Deceive" },
  { id: "drive", pt: "Condução", en: "Drive" },
  { id: "empathy", pt: "Empatia", en: "Empathy" },
  { id: "fight", pt: "Lutar", en: "Fight" },
  { id: "investigate", pt: "Investigar", en: "Investigate" },
  { id: "lore", pt: "Saberes", en: "Lore" },
  { id: "notice", pt: "Percepção", en: "Notice" },
  { id: "physique", pt: "Vigor", en: "Physique" },
  { id: "provoke", pt: "Provocar", en: "Provoke" },
  { id: "rapport", pt: "Comunicação", en: "Rapport" },
  { id: "resources", pt: "Recursos", en: "Resources" },
  { id: "shoot", pt: "Atirar", en: "Shoot" },
  { id: "stealth", pt: "Furtividade", en: "Stealth" },
  { id: "will", pt: "Vontade", en: "Will" },
] as const;

export type SkillId = (typeof SKILLS)[number]["id"];
export type Language = "pt" | "en";

const stringField = z.string().max(4000);
const aspectSchema = z.object({
  highConcept: stringField,
  trouble: stringField,
  relationship: stringField,
  other1: stringField,
  other2: stringField,
});

const consequenceSchema = z.object({
  mild: stringField,
  moderate: stringField,
  severe: stringField,
  extraMild: stringField,
});

const sessionSchema = z.object({
  fatePoints: z.number().int().min(0).max(999),
  physicalStress: z.array(z.boolean()).max(30),
  mentalStress: z.array(z.boolean()).max(30),
  consequences: consequenceSchema,
});

const sheetImageFramingSchema = z.object({
  positionX: z.number().min(0).max(100),
  positionY: z.number().min(0).max(100),
  zoom: z.number().min(1).max(2.5),
  alt: z.string().max(240),
});

export const legacySheetImageSchema = sheetImageFramingSchema.extend({
  dataUrl: z.string().max(2_800_000).refine((value) => /^data:image\/(webp|png|jpeg);base64,/i.test(value), "Imagem inválida."),
});

export const storedSheetImageSchema = sheetImageFramingSchema.extend({
  blobId: z.string().min(1).max(100),
  hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  bytes: z.number().int().nonnegative().max(20_000_000).optional(),
  contentType: z.string().max(80).optional(),
});

export const sheetImageSchema = z.union([storedSheetImageSchema, legacySheetImageSchema]);
export type SheetImage = z.infer<typeof sheetImageSchema>;
export type LegacySheetImage = z.infer<typeof legacySheetImageSchema>;
export type StoredSheetImage = z.infer<typeof storedSheetImageSchema>;

export function isStoredSheetImage(image: SheetImage | null | undefined): image is StoredSheetImage {
  return Boolean(image && "blobId" in image);
}

export function isLegacySheetImage(image: SheetImage | null | undefined): image is LegacySheetImage {
  return Boolean(image && "dataUrl" in image);
}

const sheetLinksSchema = z.object({
  rulesProfileId: z.string().max(100).default(""),
  roomParticipantId: z.string().max(100).default(""),
});

export type SheetLinks = z.infer<typeof sheetLinksSchema>;

const optionalCharacterSchema = z.object({
  conditionMarks: z.record(z.string(), z.array(z.boolean()).max(6)),
  conditionExtraTrack: z.enum(["physical", "mental"]),
  extremeConsequence: stringField,
  scale: z.enum(["mundane", "supernatural", "otherworldly", "legendary", "divine"]),
  weaponRating: z.number().int().min(0).max(4),
  armorRating: z.number().int().min(0).max(4),
  customValues: z.record(z.string(), z.string().max(1200)),
  image: sheetImageSchema.nullable().default(null),
  aspectValues: z.record(z.string(), z.string().max(4000)).default({}),
  stressMarks: z.record(z.string(), z.array(z.boolean()).max(30)).default({}),
  consequenceValues: z.record(z.string(), z.string().max(4000)).default({}),
  resourceValues: z.record(z.string(), z.string().max(1200)).default({}),
  links: sheetLinksSchema.default({ rulesProfileId: "", roomParticipantId: "" }),
});

function createOptionalCharacterState(links: Partial<SheetLinks> = {}) {
  return {
    conditionMarks: {},
    conditionExtraTrack: "physical" as const,
    extremeConsequence: "",
    scale: "mundane" as const,
    weaponRating: 0,
    armorRating: 0,
    customValues: {},
    image: null,
    aspectValues: {},
    stressMarks: {},
    consequenceValues: {},
    resourceValues: {},
    links: { rulesProfileId: "", roomParticipantId: "", ...links },
  };
}

export const characterSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100),
  name: z.string().max(240),
  description: z.string().max(8000),
  aspects: aspectSchema,
  stunts: z.array(z.string().max(8000)).max(40),
  refresh: z.number().int().min(0).max(999),
  skills: z.record(z.string(), z.number().int().min(-20).max(20)),
  session: sessionSchema,
  optional: optionalCharacterSchema.default(createOptionalCharacterState()),
  notes: z.string().max(16000),
  updatedAt: z.number().int().nonnegative(),
});

export type FateCharacter = z.infer<typeof characterSchema>;

export type LocalRoll = {
  id: string;
  dice: number[];
  modifier: number;
  total: number;
  label: string;
  createdAt: number;
  source: "local" | "room";
};

export const ADJECTIVE_LADDER: Record<number, { pt: string; en: string }> = {
  8: { pt: "Lendário", en: "Legendary" },
  7: { pt: "Épico", en: "Epic" },
  6: { pt: "Fantástico", en: "Fantastic" },
  5: { pt: "Excepcional", en: "Superb" },
  4: { pt: "Ótimo", en: "Great" },
  3: { pt: "Bom", en: "Good" },
  2: { pt: "Razoável", en: "Fair" },
  1: { pt: "Regular", en: "Average" },
  0: { pt: "Medíocre", en: "Mediocre" },
  [-1]: { pt: "Ruim", en: "Poor" },
  [-2]: { pt: "Terrível", en: "Terrible" },
  [-3]: { pt: "Catastrófico", en: "Catastrophic" },
  [-4]: { pt: "Horripilante", en: "Horrifying" },
};

export const FATE_PROBABILITIES = [
  { total: -4, ways: 1 },
  { total: -3, ways: 4 },
  { total: -2, ways: 10 },
  { total: -1, ways: 16 },
  { total: 0, ways: 19 },
  { total: 1, ways: 16 },
  { total: 2, ways: 10 },
  { total: 3, ways: 4 },
  { total: 4, ways: 1 },
] as const;

export function createUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createId(prefix = "id") {
  return `${prefix}_${createUuid()}`;
}

export function createCharacter(name = "Nova Ficha", links: Partial<SheetLinks> = {}): FateCharacter {
  return {
    version: 1,
    id: createId("pc"),
    name,
    description: "",
    aspects: {
      highConcept: "",
      trouble: "",
      relationship: "",
      other1: "",
      other2: "",
    },
    stunts: ["", "", ""],
    refresh: 3,
    skills: Object.fromEntries(SKILLS.map((skill) => [skill.id, 0])),
    session: {
      fatePoints: 3,
      physicalStress: [false, false, false, false, false, false],
      mentalStress: [false, false, false, false, false, false],
      consequences: { mild: "", moderate: "", severe: "", extraMild: "" },
    },
    optional: createOptionalCharacterState(links),
    notes: "",
    updatedAt: Date.now(),
  };
}

export function normalizeCharacter(input: unknown): FateCharacter {
  const parsed = characterSchema.parse(input);
  const optional = { ...createOptionalCharacterState(), ...parsed.optional };
  return {
    ...parsed,
    skills: {
      ...Object.fromEntries(SKILLS.map((skill) => [skill.id, 0])),
      ...parsed.skills,
    },
    optional: {
      ...optional,
      aspectValues: {
        highConcept: parsed.aspects.highConcept,
        trouble: parsed.aspects.trouble,
        relationship: parsed.aspects.relationship,
        other1: parsed.aspects.other1,
        other2: parsed.aspects.other2,
        ...optional.aspectValues,
      },
      stressMarks: {
        physicalStress: parsed.session.physicalStress,
        mentalStress: parsed.session.mentalStress,
        ...optional.stressMarks,
      },
      consequenceValues: {
        ...parsed.session.consequences,
        ...optional.consequenceValues,
      },
      resourceValues: {
        refresh: String(parsed.refresh),
        fatePoints: String(parsed.session.fatePoints),
        ...optional.resourceValues,
      },
    },
    updatedAt: Date.now(),
  };
}

export function stressBoxCount(rating: number) {
  if (rating >= 3) return 6;
  if (rating >= 1) return 4;
  return 3;
}

export function hasExtraMild(rating: number) {
  return rating >= 5;
}

export function adjectiveFor(value: number, lang: Language = "pt") {
  const bounded = Math.max(-4, Math.min(8, value));
  return ADJECTIVE_LADDER[bounded]?.[lang] ?? (lang === "pt" ? "Além da escala" : "Beyond the ladder");
}

export function fateSymbol(value: number) {
  return value < 0 ? "−" : value > 0 ? "+" : "0";
}

export function secureUniform(outcomes: number) {
  if (!Number.isInteger(outcomes) || outcomes < 1 || outcomes > 0xffffffff) {
    throw new Error("Número de resultados inválido.");
  }
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / outcomes) * outcomes;
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % outcomes;
}

export function rollFateDice() {
  const dice = Array.from({ length: 4 }, () => secureUniform(3) - 1);
  return { dice, sum: dice.reduce((total, die) => total + die, 0) };
}

export function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeJsonDownload(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  anchor.click();
  URL.revokeObjectURL(href);
}
