import { z } from "zod"

export const buildInfoSchema = z.object({
  appName: z.string(),
  appVersion: z.string(),
  target: z.string(),
  profile: z.enum(["debug", "release"]),
})

export type BuildInfo = z.infer<typeof buildInfoSchema>
