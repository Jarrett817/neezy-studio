import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useQuery } from "@tanstack/react-query"
import { MoreHorizontal, Paperclip, Square, ArrowUp, X, Sparkles, FileText, Loader2 } from "lucide-react"

import { ChatModelStatus } from "~/components/chat/chat-model-status"
import { ChatSessionSidebar } from "~/components/chat/chat-session-sidebar"
import { useAgentPermissionDialog } from "~/components/chat/agent-permission-dialog"
import { ChatMessageBubble } from "~/components/chat/chat-message"
import { ChatEditor, type ChatEditorHandle } from "~/components/chat/chat-editor"
import { Button } from "~/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet"
import { entryDisplayName } from "~/config/chat-models"
import { getRuntimeSettings, resolveChatModelEntry } from "~/services/settings"
import { useAppStore } from "~/stores/app-store"
import { useChatSession } from "~/hooks/use-chat-session"
import { useChatSend } from "~/hooks/use-chat-send"

const SYSTEM_PROMPT =
  `你是 Neezy 个人 Agent。回答用中文，语气清晰自然。工作区即当前 cwd，可用 Pi 内置 read/bash/edit/write/grep/find/ls 操作文件；联网 web_search、fetch_content、code_search。已导入的 skill 会自动加载可直接使用。soul_write 用于把有长期价值的偏好、结论、约定沉淀到 soul.md。需要时直接调用工具，勿声称工具不存在。`.trim()

const SCROLL_NEAR_BOTTOM_PX = 80

function isNearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_NEAR_BOTTOM_PX
}

export default function ChatRoute() {
  const {
    activeSessionId, setActiveSessionId, sessionsReady, sessionIdRef,
    handleSelectSession, handleNewSession,
  } = useChatSession()

  const messages = useAppStore((s) => s.conversationHistory)
  const editorRef = useRef<ChatEditorHandle>(null)
  const [hasText, setHasText] = useState(false)
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)
  const [isReadingFile, setIsReadingFile] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onScroll = () => {
    const el = scrollRef.current
    if (el) stickToBottomRef.current = isNearBottom(el)
  }

  useLayoutEffect(() => {
    if (messages.length === 0) return
    const el = scrollRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const chatEntry = runtimeSettings ? resolveChatModelEntry(runtimeSettings) : null

  const { send, abort: abortSend, isGenerating, resetAgent } = useChatSend({
    agentSystemPrompt: SYSTEM_PROMPT,
    activeSessionId,
    onSessionCreated: (sid) => flushSync(() => setActiveSessionId(sid)),
    chatEntry,
    sessionIdRef,
    sessionsReady,
  })

  useEffect(() => {
    if (!sessionsReady || !activeSessionId) return
    void resetAgent([], activeSessionId).catch(() => {})
  }, [activeSessionId, sessionsReady, resetAgent])

  const permissionDialog = useAgentPermissionDialog(activeSessionId)

  const doSend = () => {
    const text = editorRef.current?.getText() ?? ""
    const hasFile = attachedFile !== null
    if (!text && !hasFile) return

    stickToBottomRef.current = true
    const fileSnapshot = attachedFile
    editorRef.current?.clear()
    setHasText(false)
    setAttachedFile(null)

    const agentContent = fileSnapshot
      ? (text
          ? `${text}\n\n[附件: ${fileSnapshot.name}]\n---\n${fileSnapshot.content}\n---`
          : `[附件: ${fileSnapshot.name}]\n---\n${fileSnapshot.content}\n---`)
      : text
    send(agentContent)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsReadingFile(true)
    try {
      const text = await file.text()
      const content = text.length <= 32000 ? text
        : `${text.slice(0, 16000)}\n...\n(内容过长，已截断中间部分)\n...\n${text.slice(text.length - 16000)}`
      setAttachedFile({ name: file.name, content })
    } catch { /* ignore */ }
    finally { setIsReadingFile(false) }
    e.target.value = ""
  }

  const chatModelName = chatEntry ? entryDisplayName(chatEntry) : "未配置"
  const lastAssistant = messages.findLast((m) => m.role === "assistant")

  if (!sessionsReady) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" />加载对话历史…
    </div>
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border/30 px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <ChatSessionSidebar
              activeSessionId={activeSessionId}
              onSelectSession={async (id) => { await handleSelectSession(id); resetAgent([], id).catch(() => {}) }}
              onSessionCreated={async (id) => { await handleNewSession(id); resetAgent([], id).catch(() => {}) }}
            />
            <ChatModelStatus className="min-w-0 flex-1" />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground/60 hover:bg-accent/30 hover:text-foreground">
                  <MoreHorizontal className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full border-l-border/30 sm:max-w-md">
                <SheetHeader>
                  <SheetTitle className="font-heading">对话选项</SheetTitle>
                  <SheetDescription>工具 trace</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6 px-1">
                  {lastAssistant?.toolCalls?.length ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">工具 trace</p>
                      <ul className="space-y-2 text-xs">
                        {lastAssistant.toolCalls.map((tc) => (
                          <li key={tc.toolCallId} className="rounded-xl border border-border/30 bg-background/50 p-2 font-mono">
                            <span className="font-sans font-medium text-foreground">{tc.name}</span>
                            {tc.result ? <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">{tc.result.slice(0, 400)}</pre> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
              <div className="flex size-20 items-center justify-center rounded-[24px] bg-gradient-to-br from-primary/15 to-primary/5 shadow-sm ring-1 ring-primary/10">
                <Sparkles className="size-9 text-primary" />
              </div>
              <p className="font-heading text-xl font-semibold tracking-tight text-foreground/80">
                说说你想做什么
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl pb-8">
              {messages.map((m, i) => <ChatMessageBubble key={m.id} message={m} modelName={chatModelName} index={i} />)}
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 pb-5">
          <div className="mx-auto max-w-3xl">
            <div className="chat-input overflow-hidden rounded-[24px] transition-shadow focus-within:shadow-lg focus-within:ring-1 focus-within:ring-primary/25">
              {attachedFile && (
                <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="flex-1 truncate text-xs text-muted-foreground/80">{attachedFile.name}</span>
                  <Button variant="ghost" size="icon-sm" className="size-6 rounded-lg text-muted-foreground/50 hover:text-foreground" onClick={() => setAttachedFile(null)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
              <ChatEditor
                ref={editorRef}
                onEmptyChange={(empty) => setHasText(!empty)}
                placeholder="输入消息…"
                disabled={isGenerating}
                onSubmit={() => doSend()}
              />
              <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
                <div className="flex items-center gap-1">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
                  <button className="flex size-8 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-accent/40 hover:text-foreground disabled:opacity-40"
                    onClick={() => fileInputRef.current?.click()} disabled={isGenerating || isReadingFile} title="附加文件">
                    {isReadingFile ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                  </button>
                </div>
                {isGenerating ? (
                  <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground" onClick={abortSend}>
                    <Square className="size-3 fill-current" />停止
                  </Button>
                ) : (
                  <Button size="sm" className="gap-1.5 rounded-full px-5 shadow-sm"
                    disabled={isGenerating || (!hasText && !attachedFile)}
                    onClick={doSend}>
                    <ArrowUp className="size-4" />发送
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {permissionDialog}
    </div>
  )
}
