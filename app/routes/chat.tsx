import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Bot,
  Paperclip,
  Square,
  Trash2,
  User,
  Zap,
  Brain,
  Calculator,
  Calendar,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Spinner } from "~/components/ui/spinner"
import { Textarea } from "~/components/ui/textarea"
import { PageTransition } from "~/components/animation-effects"
import {
  getRuntimeSettings,
  listSkills,
} from "~/services/workspace"
import { runAgent, type AgentMessage } from "~/agents/agent-loop"
import { useAppStore, type ChatMessage } from "~/stores/app-store"
import { MarkdownContent } from "~/components/markdown-content"
import { addConversationSlice } from "~/services/storage/memory-vectors"

const SYSTEM_PROMPT = `你是 Neezy，一个智能助手。你可以通过以下工具增强能力：

1. memory_search - 搜索记忆中保存的内容
2. memory_add - 存储重要内容到长期记忆
3. memory_event - 记录事件到记忆日志
4. datetime - 获取当前时间
5. calculator - 数学计算

当用户提问时，先思考是否需要工具。如果是简单问题直接回答，如果需要信息或操作则调用工具。
如果用户上传文件并描述想要怎么处理，Agent 应自动调用 memory_add 工具将内容存入记忆。`.trim()

export default function ChatRoute() {
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentStep, setCurrentStep] = useState("")
  const [activeSkill, setActiveSkill] = useState<string | null>(null)
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)
  const [isReadingFile, setIsReadingFile] = useState(false)
  const activeAssistantId = useRef<string | null>(null)
  const firstTokenTimerRef = useRef<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 从 store 读取对话历史
  const messages = useAppStore(state => state.conversationHistory)
  const addMessage = useAppStore(state => state.addMessage)
  const updateMessage = useAppStore(state => state.updateMessage)
  const clearConversation = useAppStore(state => state.clearConversation)

  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })

  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  })

  const enabledSkills = skills.filter(s => s.enabled)

  // 读取文件内容（支持大文件分段）
  const readFileContent = async (file: File): Promise<string> => {
    const MAX_CHUNK_SIZE = 32000 // 留 2K 空间给提示词
    const text = await file.text()

    if (text.length <= MAX_CHUNK_SIZE) {
      return text
    }

    // 超大文件分段：取前半和后半，中间截断
    const half = Math.floor(text.length / 2)
    const firstChunk = text.slice(0, MAX_CHUNK_SIZE / 2)
    const secondChunk = text.slice(half + MAX_CHUNK_SIZE / 2 - text.length)
    return `${firstChunk}\n...\n(内容过长，已截断中间部分)\n...\n${secondChunk}`
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsReadingFile(true)
    try {
      const content = await readFileContent(file)
      setAttachedFile({ name: file.name, content })
      toast.success(`已附加 ${file.name}`)
    } catch (err) {
      toast.error("读取文件失败")
    } finally {
      setIsReadingFile(false)
    }
    // 清空 input 以便再次选择同一文件
    e.target.value = ""
  }

  const removeAttachedFile = () => {
    setAttachedFile(null)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, currentStep])

  useEffect(() => {
    return () => {
      if (firstTokenTimerRef.current) {
        window.clearTimeout(firstTokenTimerRef.current)
      }
    }
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    const hasText = text.length > 0
    const hasFile = attachedFile !== null
    if (!hasText && !hasFile || isGenerating) return

    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    activeAssistantId.current = assistantId

    // 构建用户消息，包含文件内容（如果有）
    let userContent = text
    if (attachedFile) {
      userContent = hasText
        ? `${text}\n\n[附件文件: ${attachedFile.name}]\n---\n${attachedFile.content}\n---`
        : `[附件文件: ${attachedFile.name}]\n---\n${attachedFile.content}\n---`
    }

    setInput("")
    setIsGenerating(true)
    setCurrentStep("正在思考...")
    setAttachedFile(null) // 发送后清除附件

    addMessage({ id: userId, role: "user", content: hasText ? userContent : `[上传了文件: ${attachedFile?.name}]`, thinking: "" })
    addMessage({ id: assistantId, role: "assistant", content: "", thinking: "", toolCalls: [] })

    firstTokenTimerRef.current = window.setTimeout(() => {
      setCurrentStep("思考中 (较慢，请稍候)")
    }, 5000)

    // 构建历史消息（从 store 读取，跳过最后一条正在生成的）
    const agentMessages: AgentMessage[] = messages
      .filter(m => m.role !== "error" && m.id !== assistantId)
      .map(m => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }))
    agentMessages.push({ role: "user", content: userContent })

    const model = settings?.ollamaModel || "qwen3:1.7b"

    try {
      const result = await runAgent(agentMessages, {
        model,
        systemPrompt: activeSkill
          ? `${SYSTEM_PROMPT}\n\n当前技能: ${activeSkill}`
          : SYSTEM_PROMPT,
        maxSteps: 5,
        onChunk: (content, thinking) => {
          updateMessage(assistantId, { content, thinking })
        },
        onToolCall: (name, args, result) => {
          const current = messages.find(m => m.id === assistantId)
          updateMessage(assistantId, {
            toolCalls: [...(current?.toolCalls || []), { name, args, result }],
          })
          setCurrentStep(`执行工具: ${name}`)
        },
        onStep: (step, action) => {
          setCurrentStep(`${step}. ${action}`)
        },
      })

      window.clearTimeout(firstTokenTimerRef.current ?? undefined)
      updateMessage(assistantId, {
        content: result.content,
        thinking: result.thinking,
      })

      // 保存聊天切片到向量库（非阻塞）
      if (text || attachedFile) {
        addConversationSlice(assistantId, userContent).catch(err => {
          console.warn("Failed to save conversation slice:", err)
        })
      }
    } catch (error) {
      window.clearTimeout(firstTokenTimerRef.current ?? undefined)
      addMessage({
        id: crypto.randomUUID(),
        role: "error",
        content: error instanceof Error ? error.message : "生成失败",
        thinking: "",
      })
    }

    window.clearTimeout(firstTokenTimerRef.current ?? undefined)
    firstTokenTimerRef.current = null
    setIsGenerating(false)
    setCurrentStep("")
    activeAssistantId.current = null
  }, [input, isGenerating, messages, settings?.ollamaModel, activeSkill, addMessage, updateMessage])

  const stop = useCallback(() => {
    setIsGenerating(false)
    setCurrentStep("已停止")
    window.clearTimeout(firstTokenTimerRef.current ?? undefined)
    firstTokenTimerRef.current = null
    activeAssistantId.current = null
  }, [])

  return (
    <PageTransition>
      <div className="flex flex-col h-full min-h-0">
        {/* 头部 */}
        <div className="flex items-center justify-between pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <span className="text-sm font-semibold">Agent 对话</span>
          </div>
          <div className="flex gap-2">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs rounded-xl" onClick={clearConversation}>
                <Trash2 className="size-3" />
                清空
              </Button>
            )}
          </div>
        </div>

        {/* 技能选择 */}
        {enabledSkills.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">技能:</span>
            <button
              onClick={() => setActiveSkill(null)}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                activeSkill === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              无
            </button>
            {enabledSkills.map(skill => (
              <button
                key={skill.id}
                onClick={() => setActiveSkill(skill.name)}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                  activeSkill === skill.name
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {skill.name}
              </button>
            ))}
          </div>
        )}

        {/* 工具提示 */}
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center">可用工具:</span>
          {[
            { name: "memory_search", icon: <Brain className="size-3" /> },
            { name: "datetime", icon: <Calendar className="size-3" /> },
            { name: "calculator", icon: <Calculator className="size-3" /> },
          ].map(tool => (
            <div key={tool.name} className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
              {tool.icon}
              <span>{tool.name}</span>
            </div>
          ))}
        </div>

        {/* 消息区 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-full flex-col items-center justify-center py-16 text-center"
            >
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                <Bot className="size-12 text-muted-foreground/30 mb-4" />
              </motion.div>
              <h3 className="font-display text-lg font-semibold">Agent 助手</h3>
              <p className="mt-1 text-sm text-muted-foreground">可以调用工具完成任务</p>
              {enabledSkills.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">选择上方技能可获得更专业的回答</p>
              )}
            </motion.div>
          ) : (
            <div className="space-y-4">
              {messages.map(message => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <MessageBubble message={message} />
                </motion.div>
              ))}
            </div>
          )}

          {/* 状态 */}
          {isGenerating && currentStep && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4">
              <Spinner className="size-4 text-primary" />
              <span className="text-xs text-muted-foreground">{currentStep}</span>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="shrink-0 glass-warm rounded-2xl border border-border/10 p-4 space-y-3 mt-2">
          {/* 附件预览 */}
          {attachedFile && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg animate-fade-up">
              <FileText className="size-4 text-primary shrink-0" />
              <span className="text-xs truncate flex-1">{attachedFile.name}</span>
              <Button variant="ghost" size="icon-sm" className="size-5" onClick={removeAttachedFile}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}

          <div className="relative">
            <Textarea
              className="min-h-16 resize-none bg-transparent border-none shadow-none p-0 pr-10 text-sm"
              placeholder="输入任务或问题… Ctrl+Enter 发送"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send()
              }}
            />
            {isGenerating && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Spinner className="size-3 text-primary" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="gap-1.5"
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating || isReadingFile}
              >
                {isReadingFile ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Paperclip className="size-4" />
                )}
              </Button>
              <span className="text-[10px] text-muted-foreground">Ctrl+Enter 发送</span>
            </div>
            {isGenerating ? (
              <Button variant="ghost" size="sm" className="gap-2 rounded-xl text-amber-600" onClick={stop}>
                <Square className="size-4" />
                停止
              </Button>
            ) : (
              <Button size="sm" className="gap-2 rounded-xl btn-warm" disabled={!input.trim() && !attachedFile} onClick={send}>
                <Zap className="size-4" />
                发送
              </Button>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const isError = message.role === "error"
  const isEmpty = !message.content && message.role === "assistant"

  return (
    <div className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot className="size-4" />
        </div>
      )}

      <div
        className={`max-w-2xl rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground"
            : isError
              ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
              : "bg-card/80"
        }`}
      >
        {isEmpty ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-4" />
            <span>正在生成<span className="cursor-blink">|</span></span>
          </div>
        ) : isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <>
            {message.thinking && (
              <details className="mb-2" open>
                <summary className="text-xs text-muted-foreground/60 cursor-pointer mb-1">思考过程</summary>
                <div className="text-xs text-muted-foreground/60 whitespace-pre-wrap">{message.thinking}</div>
              </details>
            )}
            <MarkdownContent content={message.content} />
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/20 space-y-1">
                <p className="text-xs font-medium text-muted-foreground/60">工具调用</p>
                {message.toolCalls.map((tc, i) => (
                  <div key={i} className="text-xs bg-muted/30 rounded px-2 py-1">
                    <span className="font-medium">{tc.name}</span>
                    <span className="text-muted-foreground ml-1">({JSON.stringify(tc.args)})</span>
                    {tc.result && (
                      <div className="mt-1 text-muted-foreground/80 border-t border-border/10 pt-1">
                        → {tc.result.slice(0, 200)}{tc.result.length > 200 ? "..." : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <User className="size-4" />
        </div>
      )}
    </div>
  )
}