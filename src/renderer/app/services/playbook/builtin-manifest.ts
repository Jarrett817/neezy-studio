import designerPlaybook from "~/playbooks/builtin/playbook-designer/playbook.json"
import designerProfile from "~/playbooks/builtin/input-profiles/playbook-designer.json"
import techDocProfile from "~/playbooks/builtin/input-profiles/tech-doc.json"
import testCasesProfile from "~/playbooks/builtin/input-profiles/test-cases.json"
import uiPrototypeProfile from "~/playbooks/builtin/input-profiles/ui-prototype.json"
import xhsProfile from "~/playbooks/builtin/input-profiles/xhs-minimal.json"
import techDocPlaybook from "~/playbooks/builtin/tech-doc/playbook.json"
import testCasesPlaybook from "~/playbooks/builtin/test-cases/playbook.json"
import uiPrototypePlaybook from "~/playbooks/builtin/ui-prototype/playbook.json"
import xhsPlaybook from "~/playbooks/builtin/xhs-content/playbook.json"

import {
  inputProfileSchema,
  playbookSchema,
  sceneSchema,
  type InputProfile,
  type Playbook,
  type Scene,
} from "./types"

const BUILTIN_PROFILES_RAW = [
  xhsProfile,
  designerProfile,
  techDocProfile,
  testCasesProfile,
  uiPrototypeProfile,
] as const
const BUILTIN_PLAYBOOKS_RAW = [
  xhsPlaybook,
  techDocPlaybook,
  testCasesPlaybook,
  uiPrototypePlaybook,
  designerPlaybook,
] as const

export const BUILTIN_INPUT_PROFILES: InputProfile[] = BUILTIN_PROFILES_RAW.map(
  (raw) => inputProfileSchema.parse(raw)
)

export const BUILTIN_PLAYBOOKS: Playbook[] = BUILTIN_PLAYBOOKS_RAW.map((raw) =>
  playbookSchema.parse(raw)
)

export const BUILTIN_SCENES: Scene[] = BUILTIN_PLAYBOOKS.map((playbook) => {
  const inputProfile = BUILTIN_INPUT_PROFILES.find(
    (p) => p.id === playbook.inputProfileId
  )
  if (!inputProfile) {
    throw new Error(`内置场景缺少 inputProfile: ${playbook.inputProfileId}`)
  }
  return { playbook, inputProfile }
})
