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
  type InputProfile,
  type Playbook,
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

export const BUILTIN_SKILL_SEEDS: Record<
  string,
  { name: string; description: string; instructions: string; prompt: string }
> = {
  "xhs-copy": {
    name: "小红书文稿",
    description: "生成符合小红书调性的标题、正文与标签。",
    instructions:
      "标题有吸睛力但不标题党；正文分段、口语化；标签 5~8 个，含品类与情绪词。",
    prompt:
      "你是资深小红书运营。避免夸张浮夸表述；输出结构清晰，便于一键复制发布。",
  },
  "tech-doc": {
    name: "技术文档",
    description: "重写结构清晰的技术文档与产品说明。",
    instructions:
      "使用 Markdown；章节完整（背景、目标、范围、详细设计、非功能、附录按需）；术语一致；避免空话套话。",
    prompt:
      "你是资深技术写作。输出严谨、可落地，适合开发与产研协作；API 文档需含请求/响应示例。",
  },
  "test-cases": {
    name: "测试用例",
    description: "生成功能、接口或 E2E 测试用例。",
    instructions:
      "每条用例含清晰前置条件、步骤、预期；覆盖主路径与关键异常；优先级标注合理。",
    prompt:
      "你是资深 QA。用例可执行、可追踪；接口测试注明入口/参数；E2E 注明页面与数据准备。",
  },
  "ui-prototype": {
    name: "UI 文字原型",
    description: "输出页面布局、组件层级与示例文案方案的文字原型。",
    instructions:
      "按页面拆分；描述信息架构、状态（空/加载/错误）；风格与 Notion/极简等约束一致；可用简略 ASCII 线框。",
    prompt:
      "你是 UI/UX 设计师。不生成图片，输出可供设计师在 Figma/Pixso 落地的文字规范；注重留白、层级与可访问性。",
  },
  "playbook-designer": {
    name: "场景设计助手",
    description: "根据用户意图生成 Playbook 与 InputProfile 的 JSON 草案。",
    instructions:
      "输出必须是合法 JSON 对象，包含 playbook 与 inputProfile 两个字段，字段名使用英文 camelCase。优先考虑「富文本填空」型字段（type: rich-text），用一个自然语言模板包含若干 {{tokenKey}}，由用户点击 token 填值。简单场景可保留 enum/number。",
    prompt: `你是 Neezy Studio 的场景设计助手。根据用户描述生成 Neezy 场景配置 JSON。

schema：
{
  "playbook": {
    "id": "kebab-case-id",
    "name": "用户可见的场景名",
    "description": "一两句话说清场景用途",
    "inputProfileId": "与 inputProfile.id 一致",
    "skillIds": ["关联的 skill id 数组，至少 1 个"],
    "defaultSkillId": "skillIds 中默认选中的 skill",
    "memoryScope": { "categories": ["xhs","knowledge"], "topK": 5 }（可选）,
    "steps": ["retrieve","skill","llm","parse:output"]
  },
  "inputProfile": {
    "id": "kebab-case-id",
    "fields": [...],
    "promptTemplate": "...",
    "capture": ["form","singleLineExtract","inheritPersona"]
  }
}

字段类型支持：
- text / textarea / number / enum：传统表单字段
- rich-text：富文本填空。必须提供 template（含 {{tokenKey}} 占位符）和 tokenDefs（每个 token 的类型/选项/默认值）

设计原则：
- 用户场景的「意图」用 1 个 rich-text 字段描述，自然语言模板包含关键 token（如条数、语气、主题）
- 简单补充用 textarea 字段
- id 使用小写连字符；fields 不超过 5 个；必填不超过 2 个
- promptTemplate 中用 {{fieldKey}} 引用字段值；必含 {{persona}}、{{retrievedMemories}}、{{extra}}

只输出 JSON，不要 markdown。`,
  },
}
