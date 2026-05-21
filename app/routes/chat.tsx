import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Bot,
  Paperclip,
  Square,
  Trash2,
  User,
  Zap,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { ActiveModelsStrip } from "~/components/chat/active-models-strip"
import { ModelThinkingBlock } from "~/components/chat/model-thinking-block"
import { useActiveModels } from "~/hooks/use-active-models"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { PageTransition } from "~/components/animation-effects"
import { MarkdownContent } from "~/components/markdown-content"
import { listSkills } from "~/services/workspace"
import { runAgent, type AgentMessage } from "~/agents/llm-agent"
import { getCurrentModel, resetChat } from "~/services/llm"
import { useAppStore, type ChatMessage } from "~/stores/app-store"
import { addConversationSlice } from "~/services/storage/memory-vectors"
import { rememberConversationTurn } from "~/services/memory-profile"
import {
  getPortraitContextForPrompt,
  updatePortraitFromConversation,
} from "~/services/user-portrait"
import { appendThinkModeHint, parseModelThinking } from "~/lib/agent-steps"
import { cn } from "~/lib/utils"

const SYSTEM_PROMPT =
  `你是本地大模型助手，在 Neezy Studio 中为用户服务。回答用中文，语气清晰自然，避免堆砌技术术语。可使用工具：memory_search、memory_add、memory_event、datetime、calculator。需要工具时用 JSON 代码块 {"function":{"name":"...","arguments":{...}}}。`.trim()

export default function ChatRoute() {
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeSkill, setActiveSkill] = useState<string | null>(null)
  const [attachedFile, setAttachedFile] = useState<{
    name: string
    content: string
  } | null>(null)
  const [isReadingFile, setIsReadingFile] = useState(false)
  const activeAssistantId = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messages = useAppStore((state) => state.conversationHistory)
  const addMessage = useAppStore((state) => state.addMessage)
  const updateMessage = useAppStore((state) => state.updateMessage)
  const clearConversation = useAppStore((state) => state.clearConversation)
  const getMessage = useCallback(
    (id: string) =>
      useAppStore.getState().conversationHistory.find((m) => m.id === id),
    []
  )

  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  })

  const enabledSkills = skills.filter((s) => s.enabled)
  const { chat: activeChatModel } = useActiveModels()
  const chatModelName = activeChatModel.label

  const readFileContent = async (file: File): Promise<string> => {
    const MAX_CHUNK_SIZE = 32000
    const text = await file.text()
    if (text.length <= MAX_CHUNK_SIZE) return text
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
    } catch {
      toast.error("读取文件失败")
    } finally {
      setIsReadingFile(false)
    }
    e.target.value = ""
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const patchAssistant = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      updateMessage(id, patch)
    },
    [updateMessage]
  )

  const send = useCallback(async () => {
    const text = input.trim()
    const hasText = text.length > 0
    const hasFile = attachedFile !== null
    if ((!hasText && !hasFile) || isGenerating) return

    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    activeAssistantId.current = assistantId

    let userContent = text
    if (attachedFile) {
      userContent = hasText
        ? `${text}\n\n[附件: ${attachedFile.name}]\n---\n${attachedFile.content}\n---`
        : `[附件: ${attachedFile.name}]\n---\n${attachedFile.content}\n---`
    }

    setInput("")
    setIsGenerating(true)
    setAttachedFile(null)

    addMessage({
      id: userId,
      role: "user",
      content: hasText ? userContent : `[文件] ${attachedFile?.name}`,
      thinking: "",
    })
    addMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      thinking: "",
      isStreaming: true,
      toolCalls: [],
    })

    const agentMessages: AgentMessage[] = messages
      .filter((m) => m.role !== "error" && m.id !== assistantId)
      .map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }))
    const modelFile = getCurrentModel()
    const userForAgent = appendThinkModeHint(userContent, modelFile)
    agentMessages.push({ role: "user", content: userForAgent })

    try {
      const portraitContext = await getPortraitContextForPrompt()
      const basePrompt = activeSkill
        ? `${SYSTEM_PROMPT}\n\n当前技能: ${activeSkill}`
        : SYSTEM_PROMPT

      const result = await runAgent(agentMessages, {
        systemPrompt: `${basePrompt}${portraitContext}`,
        maxSteps: 5,
        temperature: 0.7,
        maxTokens: 2048,
        onStream: ({ thinking, content }) => {
          patchAssistant(assistantId, { thinking, content })
        },
        onToolCall: (name, args, toolResult) => {
          const current = getMessage(assistantId)
          patchAssistant(assistantId, {
            toolCalls: [
              ...(current?.toolCalls || []),
              { name, args, result: toolResult },
            ],
          })
        },
      })

      const parsed = parseModelThinking(result.content)
      const finalThinking =
        getMessage(assistantId)?.thinking?.trim() || parsed.thinking

      patchAssistant(assistantId, {
        content: parsed.visible || result.content,
        thinking: finalThinking,
        isStreaming: false,
      })

      if (text || attachedFile) {
        updatePortraitFromConversation({
          userContent,
          assistantContent: parsed.visible || result.content,
        })
          .then(() =>
            queryClient.invalidateQueries({ queryKey: ["user-portrait"] })
          )
          .catch((err) => console.warn("[portrait] update failed:", err))
        rememberConversationTurn({
          userContent,
          assistantContent: parsed.visible || result.content,
        }).catch((err) => console.warn("[memory] remember failed:", err))
        addConversationSlice(assistantId, userContent).catch((err) => {
          console.warn("Failed to save conversation slice:", err)
        })
      }
    } catch (error) {
      patchAssistant(assistantId, { isStreaming: false })
      addMessage({
        id: crypto.randomUUID(),
        role: "error",
        content: error instanceof Error ? error.message : "生成失败",
        thinking: "",
      })
    }

    setIsGenerating(false)
    activeAssistantId.current = null
  }, [
    input,
    isGenerating,
    messages,
    activeSkill,
    attachedFile,
    addMessage,
    patchAssistant,
    getMessage,
    queryClient,
  ])

  const stop = useCallback(() => {
    const id = activeAssistantId.current
    if (id) {
      const current = getMessage(id)
      patchAssistant(id, { isStreaming: false })
    }
    setIsGenerating(false)
    activeAssistantId.current = null
  }, [getMessage, patchAssistant])

  return (
    <PageTransition>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/10 pb-3">
          <ActiveModelsStrip
            className="min-w-0 flex-1"
            chatSelectable
            chatPickerDisabled={isGenerating}
          />
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 rounded-full text-muted-foreground"
              onClick={() => {
                clearConversation()
                resetChat().catch(() => {})
              }}
              aria-label="清空对话"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>

        {enabledSkills.length > 0 && (
          <div className="mb-2 flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/5 py-2">
            {enabledSkills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() =>
                  setActiveSkill((prev) =>
                    prev === skill.name ? null : skill.name
                  )
                }
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs transition-all",
                  activeSkill === skill.name
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                )}
              >
                {skill.name}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-full flex-col items-center justify-center py-20 text-center"
            >
              <motion.div
                animate={{ y: [0, -6, 0], scale: [1, 1.03, 1] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-amber-100/60 shadow-lg dark:to-amber-950/40"
              >
                <Sparkles className="size-9 text-primary" />
              </motion.div>
              <p className="font-display text-xl font-semibold tracking-tight">
                说说你想做什么
              </p>
            </motion.div>
          ) : (
            <div className="space-y-5 pb-4">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <MessageBubble message={message} modelName={chatModelName} />
                </motion.div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-3 shrink-0 rounded-2xl border border-border/15 bg-card shadow-sm">
          {attachedFile && (
            <div className="flex items-center gap-2 border-b border-border/10 px-3 py-2">
              <FileText className="size-4 shrink-0 text-primary" />
              <span className="flex-1 truncate text-xs">
                {attachedFile.name}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                onClick={() => setAttachedFile(null)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}

          <Textarea
            className="min-h-[4.5rem] resize-none rounded-none border-0 bg-transparent px-3 py-3 text-sm leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-0"
            placeholder="输入消息…"
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send()
            }}
          />

          <div className="flex items-center justify-between gap-2 border-t border-border/10 px-2 py-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || isReadingFile}
              aria-label="附加文件"
            >
              {isReadingFile ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
            </Button>

            {isGenerating ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full border-amber-200/80 text-amber-700 dark:border-amber-800 dark:text-amber-300"
                onClick={stop}
              >
                <Square className="size-3.5 fill-current" />
                停止
              </Button>
            ) : (
              <Button
                size="sm"
                className="btn-warm gap-2 rounded-full px-5"
                disabled={!input.trim() && !attachedFile}
                onClick={send}
              >
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

function MessageBubble({
  message,
  modelName,
}: {
  message: ChatMessage
  modelName: string
}) {
  const isUser = message.role === "user"
  const isError = message.role === "error"
  const showThinking =
    message.role === "assistant" &&
    (Boolean(message.isStreaming) ||
      Boolean(message.thinking?.trim()) ||
      Boolean(message.toolCalls?.length))

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-primary/10 text-primary"
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div
        className={cn(
          "max-w-[min(100%,42rem)] min-w-0",
          isUser ? "items-end" : "items-start"
        )}
      >
        {isUser ? (
          <div className="rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        ) : isError ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {message.content}
          </div>
        ) : (
          <div className="space-y-3">
            {showThinking && (
              <ModelThinkingBlock
                modelName={modelName}
                thinking={message.thinking}
                isStreaming={Boolean(message.isStreaming)}
                toolCalls={message.toolCalls}
              />
            )}

            {message.content ? (
              <div className="rounded-2xl rounded-tl-md bg-card/80 px-4 py-3.5 text-sm leading-relaxed shadow-sm backdrop-blur-sm">
                <MarkdownContent content={message.content} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
