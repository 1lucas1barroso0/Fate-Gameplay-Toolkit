import { z } from "zod";
import { SKILLS, createUuid } from "@/lib/fate";

export type RuleScope = "sheet" | "dice" | "rooms" | "rules";
export type DamageMode = "consequences" | "conditions" | "split-conditions";
export type SkillShape = "pyramid" | "diamond" | "column" | "free";

export type SkillDefinition = {
  id: string;
  pt: string;
  en?: string;
};

export const SKILL_PRESETS = {
  default: {
    name: "Lista padrão",
    idea: "19 perícias do Fate Condensado",
    skills: SKILLS.map((skill) => ({ id: skill.id, pt: skill.pt, en: skill.en })),
  },
  actions: {
    name: "Ações",
    idea: "O que você faz?",
    skills: [
      ["endure", "Resistir", "Endure"], ["fight", "Lutar", "Fight"], ["know", "Saber", "Know"],
      ["move", "Mover", "Move"], ["notice", "Observar", "Notice"], ["pilot", "Pilotar", "Pilot"],
      ["sneak", "Esgueirar", "Sneak"], ["speak", "Falar", "Speak"], ["tinker", "Consertar", "Tinker"],
    ].map(([id, pt, en]) => ({ id: `actions:${id}`, pt, en })),
  },
  approaches: {
    name: "Abordagens",
    idea: "Como você faz?",
    skills: [
      ["careful", "Cuidadoso", "Careful"], ["clever", "Esperto", "Clever"], ["flashy", "Estiloso", "Flashy"],
      ["forceful", "Poderoso", "Forceful"], ["quick", "Ágil", "Quick"], ["sneaky", "Sorrateiro", "Sneaky"],
    ].map(([id, pt, en]) => ({ id: `approaches:${id}`, pt, en })),
  },
  aptitudes: {
    name: "Aptidões",
    idea: "Em que campo você se destaca?",
    skills: [
      ["athletics", "Atletismo", "Athletics"], ["combat", "Combate", "Combat"], ["leadership", "Liderança", "Leadership"],
      ["scholarship", "Conhecimento", "Scholarship"], ["subterfuge", "Subterfúgio", "Subterfuge"],
    ].map(([id, pt, en]) => ({ id: `aptitudes:${id}`, pt, en })),
  },
  attributes: {
    name: "Atributos",
    idea: "Quais são suas capacidades?",
    skills: [
      ["strength", "Força", "Strength"], ["dexterity", "Destreza", "Dexterity"], ["toughness", "Constituição", "Toughness"],
      ["intelligence", "Inteligência", "Intelligence"], ["charm", "Carisma", "Charm"],
    ].map(([id, pt, en]) => ({ id: `attributes:${id}`, pt, en })),
  },
  relationships: {
    name: "Relacionamentos",
    idea: "Com quem você age?",
    skills: [
      ["leading", "Liderança", "Leading"], ["partnering", "Parceria", "Partnering"],
      ["supporting", "Suporte", "Supporting"], ["solo", "Solo", "Solo"],
    ].map(([id, pt, en]) => ({ id: `relationships:${id}`, pt, en })),
  },
  roles: {
    name: "Papéis",
    idea: "Qual é seu lugar na equipe?",
    skills: [
      ["driver", "Piloto", "Driver"], ["hitter", "Lutador", "Hitter"], ["hacker", "Hacker", "Hacker"],
      ["gearhead", "Construtor", "Gearhead"], ["grifter", "Atravessador", "Grifter"], ["thief", "Ladrão", "Thief"],
      ["mastermind", "Mentor", "Mastermind"],
    ].map(([id, pt, en]) => ({ id: `roles:${id}`, pt, en })),
  },
  themes: {
    name: "Temas",
    idea: "Que força move sua ação?",
    skills: [
      ["air", "Ar", "Air"], ["fire", "Fogo", "Fire"], ["metal", "Metal", "Metal"], ["mind", "Mente", "Mind"],
      ["stone", "Pedra", "Stone"], ["void", "Vazio", "Void"], ["water", "Água", "Water"],
      ["wind", "Vento", "Wind"], ["wood", "Madeira", "Wood"],
    ].map(([id, pt, en]) => ({ id: `themes:${id}`, pt, en })),
  },
  values: {
    name: "Valores",
    idea: "Por que você age?",
    skills: [
      ["duty", "Dever", "Duty"], ["glory", "Glória", "Glory"], ["justice", "Justiça", "Justice"],
      ["love", "Amor", "Love"], ["power", "Poder", "Power"], ["safety", "Segurança", "Safety"],
      ["truth", "Verdade", "Truth"], ["vengeance", "Vingança", "Vengeance"],
    ].map(([id, pt, en]) => ({ id: `values:${id}`, pt, en })),
  },
} satisfies Record<string, { name: string; idea: string; skills: SkillDefinition[] }>;

export type SkillPresetId = keyof typeof SKILL_PRESETS | "custom";

export const OFFICIAL_OPTIONAL_RULES = [
  { id: "countdowns", title: "Contagem regressiva", short: "Uma trilha curta avança até algo acontecer.", scopes: ["rooms", "rules"] },
  { id: "extremeConsequences", title: "Consequências extremas", short: "Absorvem 8 tensões e mudam um Aspecto da Ficha para sempre.", scopes: ["sheet", "rules"] },
  { id: "fastContests", title: "Disputas mais rápidas", short: "Em cada rodada, escolha superar, criar vantagem ou ajudar.", scopes: ["rooms", "rules"] },
  { id: "fullDefense", title: "Defesa total", short: "Troque a ação por +2 para defender um foco até seu próximo turno.", scopes: ["dice", "rules"] },
  { id: "obstacles", title: "Obstáculos", short: "Use perigos, bloqueios e distrações que pedem soluções além de atacar.", scopes: ["rooms", "rules"] },
  { id: "scale", title: "Escala", short: "Compare níveis de Mundano a Divino quando um lado está muito acima do outro.", scopes: ["sheet", "dice", "rules"] },
  { id: "timeShifts", title: "Tensões de tempo", short: "Cada tensão acelera ou atrasa uma tarefa em um passo de tempo.", scopes: ["dice", "rules"] },
  { id: "bigBad", title: "Grande Mal", short: "Ferramentas para um grande adversário enfrentar o grupo inteiro.", scopes: ["rooms", "rules"] },
  { id: "multipleTargets", title: "Múltiplos alvos", short: "Divida o esforço ou afete uma zona quando a ficção permitir.", scopes: ["dice", "rules"] },
  { id: "weaponArmor", title: "Armas e armaduras", short: "Arma aumenta tensões; armadura reduz, normalmente entre 0 e 4.", scopes: ["sheet", "dice", "rules"] },
] as const satisfies ReadonlyArray<{ id: string; title: string; short: string; scopes: RuleScope[] }>;

export type OfficialRuleId = (typeof OFFICIAL_OPTIONAL_RULES)[number]["id"];

const customSkillSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(60),
  translation: z.string().trim().max(80).default(""),
});

const namedSheetItemSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(80),
  translation: z.string().trim().max(100).default(""),
});

const sheetStructureSchema = z.object({
  labels: z.object({
    name: z.string().trim().min(1).max(50),
    description: z.string().trim().min(1).max(50),
    aspects: z.string().trim().min(1).max(50),
    state: z.string().trim().min(1).max(50),
    stunts: z.string().trim().min(1).max(50),
    skills: z.string().trim().min(1).max(50),
    notes: z.string().trim().min(1).max(50),
  }),
  showTranslations: z.boolean(),
  imageShape: z.enum(["portrait", "square", "wide"]),
  aspects: z.array(namedSheetItemSchema).max(20),
  stressTracks: z.array(namedSheetItemSchema.extend({
    boxes: z.number().int().min(0).max(30),
    growth: z.enum(["fixed", "condensed"]),
    skillId: z.string().max(100),
  })).max(10),
  consequences: z.array(namedSheetItemSchema.extend({
    value: z.number().int().min(0).max(20),
    qualifier: z.string().trim().max(60),
    availability: z.enum(["always", "high-rating"]),
  })).max(20),
  resources: z.array(namedSheetItemSchema.extend({
    kind: z.enum(["counter", "text", "check"]),
    minimum: z.number().int().min(-999).max(999),
    maximum: z.number().int().min(-999).max(999),
  })).max(20),
  stunts: z.object({
    freeCount: z.number().int().min(0).max(20),
    maximum: z.number().int().min(1).max(40),
  }),
}).superRefine((value, context) => {
  value.resources.forEach((resource, index) => {
    if (resource.minimum > resource.maximum) {
      context.addIssue({ code: "custom", path: ["resources", index, "minimum"], message: "O mínimo precisa ser menor ou igual ao máximo." });
    }
  });
  if (value.stunts.freeCount > value.stunts.maximum) {
    context.addIssue({ code: "custom", path: ["stunts", "freeCount"], message: "A quantidade gratuita não pode passar do máximo." });
  }
});

export function createDefaultSheetStructure() {
  return {
    labels: {
      name: "Nome",
      description: "Descrição",
      aspects: "Aspectos",
      state: "Estado atual",
      stunts: "Façanhas",
      skills: "Perícias",
      notes: "Anotações",
    },
    showTranslations: true,
    imageShape: "portrait" as const,
    aspects: [
      { id: "highConcept", label: "Conceito", translation: "High concept" },
      { id: "trouble", label: "Dificuldade", translation: "Trouble" },
      { id: "relationship", label: "Relacionamento", translation: "Relationship" },
      { id: "other1", label: "Outro aspecto", translation: "Other aspect" },
      { id: "other2", label: "Outro aspecto", translation: "Other aspect" },
    ],
    stressTracks: [
      { id: "physicalStress", label: "Estresse físico", translation: "Physical stress", boxes: 3, growth: "condensed" as const, skillId: "physique" },
      { id: "mentalStress", label: "Estresse mental", translation: "Mental stress", boxes: 3, growth: "condensed" as const, skillId: "will" },
    ],
    consequences: [
      { id: "mild", label: "Suave", translation: "Mild", value: 2, qualifier: "", availability: "always" as const },
      { id: "moderate", label: "Moderada", translation: "Moderate", value: 4, qualifier: "", availability: "always" as const },
      { id: "severe", label: "Severa", translation: "Severe", value: 6, qualifier: "", availability: "always" as const },
      { id: "extraMild", label: "Suave", translation: "Mild", value: 2, qualifier: "Extra", availability: "high-rating" as const },
    ],
    resources: [
      { id: "refresh", label: "Recarga", translation: "Refresh", kind: "counter" as const, minimum: 1, maximum: 8 },
      { id: "fatePoints", label: "Pontos de Destino", translation: "Fate points", kind: "counter" as const, minimum: 0, maximum: 99 },
    ],
    stunts: { freeCount: 3, maximum: 12 },
  };
}

const customRuleSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(90),
  description: z.string().trim().min(1).max(1600),
  enabled: z.boolean().default(true),
  scopes: z.array(z.enum(["sheet", "dice", "rooms", "rules"])).min(1).max(4),
  field: z.object({
    label: z.string().trim().min(1).max(80),
    type: z.enum(["text", "number", "check"]),
    hint: z.string().trim().max(160),
  }).nullable().default(null),
});

const officialRuleDefaults: Record<OfficialRuleId, boolean> = {
  countdowns: false,
  extremeConsequences: false,
  fastContests: false,
  fullDefense: false,
  obstacles: false,
  scale: false,
  timeShifts: false,
  bigBad: false,
  multipleTargets: false,
  weaponArmor: false,
};

const themeSchema = z.preprocess((theme) => theme === "system" ? "dark" : theme, z.enum(["light", "dark"]));

export const tableConfigSchema = z.object({
  version: z.literal(1),
  profileName: z.string().trim().min(1).max(80),
  appearance: z.object({
    theme: themeSchema,
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    density: z.enum(["comfortable", "compact"]),
    textSize: z.enum(["normal", "large"]),
    corners: z.enum(["soft", "square"]),
  }),
  damageMode: z.enum(["consequences", "conditions", "split-conditions"]),
  skillSystem: z.object({
    preset: z.enum(["default", "actions", "approaches", "aptitudes", "attributes", "relationships", "roles", "themes", "values", "custom"]),
    shape: z.enum(["pyramid", "diamond", "column", "free"]),
    customSkills: z.array(customSkillSchema).max(30),
    ratingFloor: z.number().int().min(-20).max(20),
    ratingCeiling: z.number().int().min(-20).max(20),
    physicalStressSkillId: z.string().max(100),
    mentalStressSkillId: z.string().max(100),
  }),
  createDuringPlay: z.boolean(),
  sheetStructure: sheetStructureSchema.default(createDefaultSheetStructure),
  officialRules: z.object({
    countdowns: z.boolean(),
    extremeConsequences: z.boolean(),
    fastContests: z.boolean(),
    fullDefense: z.boolean(),
    obstacles: z.boolean(),
    scale: z.boolean(),
    timeShifts: z.boolean(),
    bigBad: z.boolean(),
    multipleTargets: z.boolean(),
    weaponArmor: z.boolean(),
  }),
  customRules: z.array(customRuleSchema).max(40),
  updatedAt: z.number().int().nonnegative(),
}).superRefine((value, context) => {
  if (value.skillSystem.ratingFloor > value.skillSystem.ratingCeiling) {
    context.addIssue({ code: "custom", path: ["skillSystem", "ratingFloor"], message: "O menor valor precisa vir antes do maior." });
  }
});

export type TableConfig = z.infer<typeof tableConfigSchema>;
export type CustomRule = TableConfig["customRules"][number];

export function createDefaultTableConfig(): TableConfig {
  return {
    version: 1,
    profileName: "Fate Condensado",
    appearance: {
      theme: "dark",
      accent: "#01b4ee",
      density: "comfortable",
      textSize: "normal",
      corners: "soft",
    },
    damageMode: "consequences",
    skillSystem: {
      preset: "default",
      shape: "pyramid",
      customSkills: [],
      ratingFloor: -4,
      ratingCeiling: 8,
      physicalStressSkillId: "physique",
      mentalStressSkillId: "will",
    },
    createDuringPlay: false,
    sheetStructure: createDefaultSheetStructure(),
    officialRules: { ...officialRuleDefaults },
    customRules: [],
    updatedAt: Date.now(),
  };
}

export function normalizeTableConfig(input: unknown): TableConfig {
  return { ...tableConfigSchema.parse(input), updatedAt: Date.now() };
}

export function getSkillDefinitions(config: TableConfig): SkillDefinition[] {
  if (config.skillSystem.preset === "custom") {
    return config.skillSystem.customSkills.map((skill) => ({ id: skill.id, pt: skill.name, en: skill.translation }));
  }
  return SKILL_PRESETS[config.skillSystem.preset].skills;
}

export function getActiveOfficialRules(config: TableConfig) {
  return OFFICIAL_OPTIONAL_RULES.filter((rule) => config.officialRules[rule.id]);
}

export function getContextRules(config: TableConfig, scope: RuleScope) {
  const official = getActiveOfficialRules(config)
    .filter((rule) => (rule.scopes as readonly RuleScope[]).includes(scope))
    .map((rule) => ({ id: rule.id, name: rule.title, description: rule.short, kind: "official" as const }));
  const custom = config.customRules
    .filter((rule) => rule.enabled && rule.scopes.includes(scope))
    .map((rule) => ({ id: rule.id, name: rule.name, description: rule.description, kind: "custom" as const }));
  return [...official, ...custom];
}

export function activeRuleCount(config: TableConfig) {
  return getActiveOfficialRules(config).length
    + config.customRules.filter((rule) => rule.enabled).length
    + Number(config.damageMode !== "consequences")
    + Number(config.skillSystem.preset !== "default")
    + Number(config.createDuringPlay)
    + Number(JSON.stringify(config.sheetStructure) !== JSON.stringify(createDefaultSheetStructure()));
}

export function summarizeTableConfig(config: TableConfig) {
  const choices = [
    config.damageMode === "consequences" ? "Consequências" : config.damageMode === "conditions" ? "Condições" : "Condições separadas",
    SKILL_PRESETS[config.skillSystem.preset as keyof typeof SKILL_PRESETS]?.name ?? "Lista própria de perícias",
    ...getActiveOfficialRules(config).map((rule) => rule.title),
    ...config.customRules.filter((rule) => rule.enabled).map((rule) => rule.name),
  ];
  if (JSON.stringify(config.sheetStructure) !== JSON.stringify(createDefaultSheetStructure())) choices.push("Ficha personalizada");
  return `Regras de ${config.profileName}: ${choices.join(" · ")}.`;
}

export function makeCustomSkill(name: string) {
  return { id: `custom:${createUuid()}`, name: name.trim(), translation: "" };
}

export function makeSheetItem(prefix: string, label: string) {
  return { id: `${prefix}:${createUuid()}`, label: label.trim(), translation: "" };
}

export function makeCustomRule(input: Omit<CustomRule, "id" | "enabled">): CustomRule {
  return { ...input, id: `rule_${createUuid()}`, enabled: true };
}
