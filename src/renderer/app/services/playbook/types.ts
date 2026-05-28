import { z } from "zod"

export const inputFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "number", "enum"]).optional(),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number()]).optional(),
  chips: z.array(z.union([z.string(), z.number()])).optional(),
  options: z.array(z.string()).optional(),
  chip: z.boolean().optional(),
})

export const inputProfileSchema = z.object({
  id: z.string(),
  version: z.number().optional(),
  capture: z
    .array(
      z.enum([
        "chips",
        "singleLineExtract",
        "slotFilling",
        "inheritPersona",
        "form",
      ])
    )
    .optional(),
  fields: z.array(inputFieldSchema),
  slotFilling: z
    .object({
      enabled: z.boolean(),
      maxTurns: z.number().optional(),
      onlyAskRequired: z.boolean().optional(),
    })
    .optional(),
  promptTemplate: z.string(),
})

export const memoryScopeSchema = z.object({
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  topK: z.number().default(5),
  allowExpandSearch: z.boolean().optional(),
})

export const playbookSchema = z.object({
  id: z.string(),
  version: z.number().optional(),
  name: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  builtin: z.boolean().optional(),
  inputProfileId: z.string(),
  memoryScope: memoryScopeSchema.optional(),
  skillIds: z.array(z.string()).min(1),
  defaultSkillId: z.string().optional(),
  steps: z.array(z.string()).optional(),
  outputSchema: z
    .object({
      type: z.literal("object").optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  persist: z.object({ target: z.enum(["none"]) }).optional(),
  export: z.object({ template: z.string().optional() }).optional(),
})

export type InputField = z.infer<typeof inputFieldSchema>
export type InputProfile = z.infer<typeof inputProfileSchema>
export type MemoryScope = z.infer<typeof memoryScopeSchema>
export type Playbook = z.infer<typeof playbookSchema>

export type PlaybookSlots = Record<string, string | number | boolean | undefined>

export type PlaybookRunTrace = {
  playbookId: string
  skillId: string
  memoriesUsed: number
  elapsedMs: number
  stages: string[]
}

export type PlaybookRunResult = {
  ok: boolean
  output?: Record<string, unknown>
  rawText?: string
  trace: PlaybookRunTrace
  error?: string
}

