/** @typedef {"light" | "balanced" | "performance"} ModelTier */

/** @typedef {"chat" | "embedding"} ModelKind */

/**

 * @typedef {object} ModelDefinition

 * @property {string} id

 * @property {ModelKind} kind

 * @property {ModelTier} tier

 * @property {string} tierLabel

 * @property {string} title

 * @property {string} subtitle

 * @property {string} fileName

 * @property {string[]} [aliases]

 * @property {string} sizeLabel

 * @property {number} sizeBytes

 * @property {number} minMemoryGb

 * @property {number} [embeddingDim]

 * @property {string[]} fit

 * @property {string} repo

 * @property {string} repoPath

 * @property {string} [revision]

 */

/** 统一使用 bartowski 等社区的 Q4_K_M 量化 GGUF，便于本地推理与下载校验 */

/** @type {ModelDefinition[]} */

const CHAT_MODELS = [
  // —— 轻量 ——

  {
    id: "qwen3-1.7b-daily",

    kind: "chat",

    tier: "light",

    tierLabel: "轻量",

    title: "Qwen3 1.7B",

    subtitle: "Qwen3 · Q4_K_M · 日常聊天与轻量写作。",

    fileName: "Qwen_Qwen3-1.7B-Q4_K_M.gguf",

    aliases: ["Qwen3-1.7B-Q4_K_M.gguf"],

    sizeLabel: "约 1.2 GB",

    sizeBytes: 1190000000,

    minMemoryGb: 8,

    fit: ["日常问答", "轻量写作"],

    repo: "bartowski/Qwen_Qwen3-1.7B-GGUF",

    repoPath: "Qwen_Qwen3-1.7B-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "qwen25-1.5b-light",

    kind: "chat",

    tier: "light",

    tierLabel: "轻量",

    title: "Qwen2.5 1.5B",

    subtitle: "Qwen2.5 · Q4_K_M · 中文友好、体积小。",

    fileName: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 1.0 GB",

    sizeBytes: 986048768,

    minMemoryGb: 8,

    fit: ["中文对话", "快速草稿"],

    repo: "bartowski/Qwen2.5-1.5B-Instruct-GGUF",

    repoPath: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "qwen25-0.5b-ultra-light",

    kind: "chat",

    tier: "light",

    tierLabel: "轻量",

    title: "Qwen2.5 0.5B",

    subtitle: "Qwen2.5 · Q4_K_M · 极小体积，低配机首选。",

    fileName: "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 0.4 GB",

    sizeBytes: 397808192,

    minMemoryGb: 6,

    fit: ["极低内存", "试玩体验"],

    repo: "bartowski/Qwen2.5-0.5B-Instruct-GGUF",

    repoPath: "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "llama32-1b-light",

    kind: "chat",

    tier: "light",

    tierLabel: "轻量",

    title: "Llama 3.2 1B",

    subtitle: "Meta Llama · Q4_K_M · 英文与通用指令。",

    fileName: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 0.8 GB",

    sizeBytes: 807694464,

    minMemoryGb: 8,

    fit: ["英文对话", "轻量助手"],

    repo: "bartowski/Llama-3.2-1B-Instruct-GGUF",

    repoPath: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "smollm2-1.7b-light",

    kind: "chat",

    tier: "light",

    tierLabel: "轻量",

    title: "SmolLM2 1.7B",

    subtitle: "HuggingFace SmolLM · Q4_K_M · 超轻量指令模型。",

    fileName: "SmolLM2-1.7B-Instruct-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 1.1 GB",

    sizeBytes: 1100000000,

    minMemoryGb: 8,

    fit: ["低配设备", "快速回复"],

    repo: "bartowski/SmolLM2-1.7B-Instruct-GGUF",

    repoPath: "SmolLM2-1.7B-Instruct-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "gemma-2-2b-light",

    kind: "chat",

    tier: "light",

    tierLabel: "轻量",

    title: "Gemma 2 2B",

    subtitle: "Google Gemma · Q4_K_M · 轻量但表达自然。",

    fileName: "gemma-2-2b-it-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 1.7 GB",

    sizeBytes: 1708582752,

    minMemoryGb: 10,

    fit: ["多语言", "日常助手"],

    repo: "bartowski/gemma-2-2b-it-GGUF",

    repoPath: "gemma-2-2b-it-Q4_K_M.gguf",

    revision: "main",
  },

  // —— 中等 ——

  {
    id: "qwen25-3b-balanced",

    kind: "chat",

    tier: "balanced",

    tierLabel: "中等",

    title: "Qwen2.5 3B",

    subtitle: "Qwen2.5 · Q4_K_M · 中文与推理的均衡之选。",

    fileName: "Qwen2.5-3B-Instruct-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 1.9 GB",

    sizeBytes: 1929903264,

    minMemoryGb: 12,

    fit: ["中文创作", "资料整理"],

    repo: "bartowski/Qwen2.5-3B-Instruct-GGUF",

    repoPath: "Qwen2.5-3B-Instruct-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "phi35-mini-balanced",

    kind: "chat",

    tier: "balanced",

    tierLabel: "中等",

    title: "Phi-3.5 Mini",

    subtitle: "Microsoft Phi · Q4_K_M · 理解与写作较稳。",

    fileName: "Phi-3.5-mini-instruct-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 2.4 GB",

    sizeBytes: 2400000000,

    minMemoryGb: 12,

    fit: ["长对话", "内容创作"],

    repo: "bartowski/Phi-3.5-mini-instruct-GGUF",

    repoPath: "Phi-3.5-mini-instruct-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "llama32-3b-balanced",

    kind: "chat",

    tier: "balanced",

    tierLabel: "中等",

    title: "Llama 3.2 3B",

    subtitle: "Meta Llama · Q4_K_M · 通用能力强。",

    fileName: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 2.0 GB",

    sizeBytes: 2000000000,

    minMemoryGb: 12,

    fit: ["通用对话", "资料整理"],

    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",

    repoPath: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",

    revision: "main",
  },

  // —— 高性能 ——

  {
    id: "qwen3-4b-quality",

    kind: "chat",

    tier: "performance",

    tierLabel: "高性能",

    title: "Qwen3 4B",

    subtitle: "Qwen3 · Q4_K_M · 复杂写作与分析，16GB+ 内存更佳。",

    fileName: "Qwen_Qwen3-4B-Q4_K_M.gguf",

    aliases: ["Qwen3-4B-Q4_K_M.gguf"],

    sizeLabel: "约 2.6 GB",

    sizeBytes: 2600000000,

    minMemoryGb: 16,

    fit: ["深度分析", "高质量文案"],

    repo: "bartowski/Qwen_Qwen3-4B-GGUF",

    repoPath: "Qwen_Qwen3-4B-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "qwen25-7b-performance",

    kind: "chat",

    tier: "performance",

    tierLabel: "高性能",

    title: "Qwen2.5 7B",

    subtitle: "Qwen2.5 · Q4_K_M · 强中文与长文能力。",

    fileName: "Qwen2.5-7B-Instruct-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 4.7 GB",

    sizeBytes: 4683074240,

    minMemoryGb: 18,

    fit: ["长文写作", "复杂推理"],

    repo: "bartowski/Qwen2.5-7B-Instruct-GGUF",

    repoPath: "Qwen2.5-7B-Instruct-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "qwen3-8b-performance",

    kind: "chat",

    tier: "performance",

    tierLabel: "高性能",

    title: "Qwen3 8B",

    subtitle: "Qwen3 · Q4_K_M · 更强推理与表达。",

    fileName: "Qwen_Qwen3-8B-Q4_K_M.gguf",

    aliases: ["Qwen3-8B-Q4_K_M.gguf"],

    sizeLabel: "约 5.0 GB",

    sizeBytes: 5000000000,

    minMemoryGb: 20,

    fit: ["复杂任务", "长文写作"],

    repo: "bartowski/Qwen_Qwen3-8B-GGUF",

    repoPath: "Qwen_Qwen3-8B-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "mistral-7b-performance",

    kind: "chat",

    tier: "performance",

    tierLabel: "高性能",

    title: "Mistral 7B v0.3",

    subtitle: "Mistral · Q4_K_M · 经典 7B 指令模型。",

    fileName: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 4.4 GB",

    sizeBytes: 4372812000,

    minMemoryGb: 18,

    fit: ["英文写作", "代码草稿"],

    repo: "bartowski/Mistral-7B-Instruct-v0.3-GGUF",

    repoPath: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "llama31-8b-performance",

    kind: "chat",

    tier: "performance",

    tierLabel: "高性能",

    title: "Llama 3.1 8B",

    subtitle: "Meta Llama · Q4_K_M · 通用 8B 旗舰量化版。",

    fileName: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",

    aliases: ["Llama-3.1-8B-Instruct-Q4_K_M.gguf"],

    sizeLabel: "约 4.9 GB",

    sizeBytes: 4920000000,

    minMemoryGb: 20,

    fit: ["通用助手", "多语言"],

    repo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",

    repoPath: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "gemma-2-9b-performance",

    kind: "chat",

    tier: "performance",

    tierLabel: "高性能",

    title: "Gemma 2 9B",

    subtitle: "Google Gemma · Q4_K_M · 高质量多语言，内存占用较高。",

    fileName: "gemma-2-9b-it-Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 5.8 GB",

    sizeBytes: 5761057728,

    minMemoryGb: 22,

    fit: ["高质量文案", "复杂对话"],

    repo: "bartowski/gemma-2-9b-it-GGUF",

    repoPath: "gemma-2-9b-it-Q4_K_M.gguf",

    revision: "main",
  },
]

/** @type {ModelDefinition[]} */

const EMBEDDING_MODELS = [
  {
    id: "nomic-embed-q4-light",

    kind: "embedding",

    tier: "light",

    tierLabel: "轻量",

    title: "Nomic Embed Q4",

    subtitle: "Nomic · Q4_K_M · 体积小、速度快，适合日常记忆检索。",

    fileName: "nomic-embed-text-v1.5.Q4_K_M.gguf",

    aliases: [],

    sizeLabel: "约 84 MB",

    sizeBytes: 88000000,

    minMemoryGb: 4,

    embeddingDim: 768,

    fit: ["记忆检索", "低配友好"],

    repo: "nomic-ai/nomic-embed-text-v1.5-GGUF",

    repoPath: "nomic-embed-text-v1.5.Q4_K_M.gguf",

    revision: "main",
  },

  {
    id: "nomic-embed-q8-balanced",

    kind: "embedding",

    tier: "balanced",

    tierLabel: "中等",

    title: "Nomic Embed Q8",

    subtitle: "Nomic · Q8_0 · 向量质量更好，推荐默认 Embedding。",

    fileName: "nomic-embed-text-v1.5.Q8_0.gguf",

    aliases: [],

    sizeLabel: "约 160 MB",

    sizeBytes: 160000000,

    minMemoryGb: 6,

    embeddingDim: 768,

    fit: ["语义搜索", "知识库"],

    repo: "nomic-ai/nomic-embed-text-v1.5-GGUF",

    repoPath: "nomic-embed-text-v1.5.Q8_0.gguf",

    revision: "main",
  },

  {
    id: "nomic-embed-f16-performance",

    kind: "embedding",

    tier: "performance",

    tierLabel: "高性能",

    title: "Nomic Embed F16",

    subtitle: "Nomic · F16 · 最高向量精度，占用略高。",

    fileName: "nomic-embed-text-v1.5.f16.gguf",

    aliases: ["nomic-embed-text-v1.5.F16.gguf"],

    sizeLabel: "约 270 MB",

    sizeBytes: 270000000,

    minMemoryGb: 8,

    embeddingDim: 768,

    fit: ["高精度检索", "大量记忆"],

    repo: "nomic-ai/nomic-embed-text-v1.5-GGUF",

    repoPath: "nomic-embed-text-v1.5.f16.gguf",

    revision: "main",
  },
]

const ALL_MODELS = [...CHAT_MODELS, ...EMBEDDING_MODELS]

const TIER_ORDER = { light: 0, balanced: 1, performance: 2 }

function getModelsByKind(kind) {
  return ALL_MODELS.filter((m) => m.kind === kind)
}

function findModel(modelId) {
  return ALL_MODELS.find((m) => m.id === modelId) ?? null
}

module.exports = {
  CHAT_MODELS,

  EMBEDDING_MODELS,

  ALL_MODELS,

  TIER_ORDER,

  getModelsByKind,

  findModel,
}
