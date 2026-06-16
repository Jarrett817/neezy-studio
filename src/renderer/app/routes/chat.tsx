import { useState, useRef, useLayoutEffect, useCallback, useEffect } from "react"
import { flushSync } from "react-dom"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { MoreHorizontal, Paperclip, Square, Zap, Sparkles, FileText, Loader2 } from "lucide-react"

import { ChatModelStatus } from "~/components/chat/chat-model-status"
import { ChatSessionSidebar } from "~/components/chat/chat-session-sidebar"
import { useAgentPermissionDialog } from "~/components/chat/agent-permission-dialog"
import { ChatMessageBubble } from "~/components/chat/chat-message"
import { ChatEditor } from "~/components/chat/chat-editor"
import { PlaybookInputForm } from "~/components/playbook/playbook-input-form"
import { Button } from "~/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet"
import { entryDisplayName } from "~/config/chat-models"
import { getRuntimeSettings, resolveChatModelEntry } from "~/services/settings"
import { useAppStore } from "~/stores/app-store"
import { useChatSession } from "~/hooks/use-chat-session"
import { useChatSend } from "~/hooks/use-chat-send"
import {
  compilePrompt, buildSceneAgentSystemPrompt, ensurePlaybookDirs, getScene,
  validateProfileSlots,
  type InputProfile, type PlaybookSlots,
} from "~/services/playbook"
import type { JSONContent } from "@tiptap/react"

const SYSTEM_PROMPT =
  `你是 Neezy Studio 中的对话助手。回答用中文，语气清晰自然。可用工具包括：memory_search、memory_add、memory_event；skill_catalog_search、skill_install（installKey 如 anthropic:xlsx、cursor:cursor-team-kit--fix-ci，目录含 Anthropic 与 Cursor 官方）；无头网页自动化 browser_*（pi-textbrowser，Chromium 由应用自动安装）；Pi 内置 read/bash/edit/write/grep/find/ls；联网 web_search、fetch_content、code_search（pi-web-access）。需要时请直接调用，勿声称工具不存在；browser_* 失败时不要让用户手动安装 Chromium。`.trim()

const SCROLL_NEAR_BOTTOM_PX = 80

function isNearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_NEAR_BOTTOM_PX
}

function buildSceneAgentPayload(
  profile: InputProfile, slots: Record<string, unknown>,
  chatText: string, file: { name: string; content: string } | null,
) {
  const compiled = compilePrompt(profile, { slots: slots as PlaybookSlots })
  const parts = [compiled]
  const extra = chatText.trim()
  if (extra) parts.push(`【补充说明】\n${extra}`)
  if (file) parts.push(`[附件: ${file.name}]\n---\n${file.content}\n---`)
  return parts.join("\n\n")
}

function extractText(json: JSONContent | null): string {
  if (!json?.content) return ""
  let result = ""
  for (const node of json.content) {
    if (node.type === "paragraph") { result += (node.content?.map((c) => c.text ?? "").join("") ?? "") + "\n" }
    else if (node.type === "heading") { result += (node.content?.map((c) => c.text ?? "").join("") ?? "") + "\n" }
    else if (node.type === "bulletList" || node.type === "orderedList") {
      for (const item of node.content ?? []) {
        result += "- " + (item.content?.map((c) => c.content?.map((t) => t.text ?? "").join("") ?? "").join("") ?? "") + "\n"
      }
    } else if (node.type === "codeBlock") { result += "```\n" + (node.content?.map((c) => c.text ?? "").join("") ?? "") + "\n```\n" }
    else if (node.text) result += node.text
  }
  return result.trim()
}

export default function ChatRoute() {
  const {
    activeSessionId, setActiveSessionId, activePlaybookId, sessionsReady, sessionIdRef,
    handleSelectSession, handleNewSession, syncPlaybookInUrl, queryClient,
  } = useChatSession()

  const messages = useAppStore((s) => s.conversationHistory)
  const [sceneSlotValues, setSceneSlotValues] = useState<Record<string, unknown>>({})
  const [editorContent, setEditorContent] = useState<JSONContent | null>(null)
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)
  const [isReadingFile, setIsReadingFile] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sceneBootRef = useRef("")

  useEffect(() => {
    const bootKey = `${activeSessionId ?? ""}\0${activePlaybookId ?? ""}`
    if (bootKey === sceneBootRef.current) return
    sceneBootRef.current = bootKey
    setSceneSlotValues({})
  }, [activeSessionId, activePlaybookId])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (el) stickToBottomRef.current = isNearBottom(el)
  }, [])

  useLayoutEffect(() => {
    if (messages.length === 0) return
    if (stickToBottomRef.current) scrollToBottom()
  }, [messages, scrollToBottom])

  const { data: activeScene } = useQuery({
    queryKey: ["scene", activePlaybookId],
    queryFn: async () => { await ensurePlaybookDirs(); return getScene(activePlaybookId!) },
    enabled: Boolean(activePlaybookId),
  })

  const scenePlaybook = activeScene?.playbook ?? null
  const sceneProfile = activeScene?.inputProfile ?? null
  const showScenePanel = Boolean(scenePlaybook && sceneProfile)

  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const chatEntry = runtimeSettings ? resolveChatModelEntry(runtimeSettings) : null

  const agentSystemPrompt =
    scenePlaybook != null
      ? buildSceneAgentSystemPrompt(SYSTEM_PROMPT, scenePlaybook)
      : sceneProfile != null
        ? [SYSTEM_PROMPT, "", `【当前输入场景】${sceneProfile.name ?? sceneProfile.id}`, sceneProfile.description ?? "", "右侧面板参数会作为隐藏上下文随每条消息发送；聊天框仅写补充说明。"].join("\n")
        : SYSTEM_PROMPT

  const { send, abort: abortSend, isGenerating, resetAgent } = useChatSend({
    agentSystemPrompt, activeSessionId,
    onSessionCreated: (sid) => flushSync(() => setActiveSessionId(sid)),
    activePlaybookId,
    sceneProfile, scenePlaybook, sceneSlotValues, chatEntry, syncPlaybookInUrl, sessionIdRef, sessionsReady,
  })

  useEffect(() => {
    if (!sessionsReady || !activeSessionId) return
    void resetAgent([], activeSessionId).catch(() => {})
  }, [activeSessionId, sessionsReady, resetAgent])

  // 从场景运行页跳转来时，自动发送第一条编译好的消息
  const firstMessageSentRef = useRef(false)
  useEffect(() => {
    if (firstMessageSentRef.current) return
    if (!sessionsReady || !activeSessionId) return
    if (isGenerating) return
    const firstMessage = sessionStorage.getItem("scene_first_message")
    if (!firstMessage) return
    const image = sessionStorage.getItem("scene_first_image")
    sessionStorage.removeItem("scene_first_message")
    sessionStorage.removeItem("scene_playbook_id")
    sessionStorage.removeItem("scene_first_image")
    firstMessageSentRef.current = true
    const contentJson = image
      ? {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: firstMessage }] },
            { type: "image", attrs: { src: image, alt: "白板截图" } },
          ],
        }
      : undefined
    send(image ? `${firstMessage}\n\n[白板截图]\n${image}` : firstMessage, { contentJson })
  }, [sessionsReady, activeSessionId, isGenerating, send, scenePlaybook])

  const permissionDialog = useAgentPermissionDialog(activeSessionId)

  const doSend = useCallback(() => {
    const text = extractText(editorContent).trim()
    const hasFile = attachedFile !== null
    const inScene = Boolean(sceneProfile)

    if (inScene && sceneProfile) {
      if (!validateProfileSlots(sceneProfile, sceneSlotValues)) return
    } else if (!text && !hasFile) return

    stickToBottomRef.current = true
    const fileSnapshot = attachedFile
    setEditorContent(null)
    setAttachedFile(null)

    let agentContent: string
    if (inScene && sceneProfile) {
      agentContent = buildSceneAgentPayload(sceneProfile, sceneSlotValues, text, fileSnapshot)
    } else if (fileSnapshot) {
      agentContent = text
        ? `${text}\n\n[附件: ${fileSnapshot.name}]\n---\n${fileSnapshot.content}\n---`
        : `[附件: ${fileSnapshot.name}]\n---\n${fileSnapshot.content}\n---`
    } else {
      agentContent = text
    }
    send(agentContent)
  }, [editorContent, attachedFile, sceneProfile, scenePlaybook, sceneSlotValues, send])

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

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  const chatModelName = chatEntry ? entryDisplayName(chatEntry) : "未配置"
  const sceneFilled = !sceneProfile || validateProfileSlots(sceneProfile, sceneSlotValues)

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
            <div className="flex h-full flex-col items-center justify-center gap-5 px-4">
              <div className="flex size-24 items-center justify-center rounded-[28px] bg-primary/8">
                <Sparkles className="size-10 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-heading text-xl font-semibold tracking-tight text-foreground/90">
                  {showScenePanel ? scenePlaybook?.name : "说说你想做什么"}
                </p>
                {showScenePanel && scenePlaybook?.description ? (
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground/70">{scenePlaybook.description}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl pb-8">
              {messages.map((m, i) => <ChatMessageBubble key={m.id} message={m} modelName={chatModelName} index={i} />)}
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 pb-4">
          <div className="mx-auto max-w-3xl">
            <div className="chat-input overflow-hidden rounded-[20px]">
              {attachedFile && (
                <div className="flex items-center gap-2 border-b border-border/20 px-4 py-2.5">
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="flex-1 truncate text-xs text-muted-foreground/80">{attachedFile.name}</span>
                  <Button variant="ghost" size="icon-sm" className="size-6 rounded-lg text-muted-foreground/50 hover:text-foreground" onClick={() => setAttachedFile(null)}>
                    <Square className="size-3" />
                  </Button>
                </div>
              )}
              <ChatEditor
                value={editorContent}
                onChange={setEditorContent}
                placeholder={showScenePanel ? "补充说明（可选）…" : "输入消息…"}
                disabled={isGenerating}
                onSubmit={() => doSend()}
              />
              <div className="flex items-center justify-between gap-3 border-t border-border/20 px-3 py-2.5">
                <div className="flex items-center gap-1">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
                  <button className="flex size-8 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-accent/30 hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()} disabled={isGenerating || isReadingFile}>
                    {isReadingFile ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                  </button>
                </div>
                {isGenerating ? (
                  <Button variant="outline" size="sm" className="gap-2 rounded-full border-primary/20 text-primary/80 hover:bg-primary/10 hover:text-primary" onClick={abortSend}>
                    <Square className="size-3.5 fill-current" />停止
                  </Button>
                ) : (
                  <Button size="sm" className="gap-2 rounded-full bg-primary/15 px-5 text-primary shadow-sm hover:bg-primary/25"
                    disabled={isGenerating || (showScenePanel ? !sceneFilled : (!editorContent && !attachedFile))}
                    onClick={doSend}>
                    <Zap className="size-4" />发送
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showScenePanel ? (
        <aside className="hidden w-80 shrink-0 flex-col border-l border-border/40 bg-card lg:flex">
          <div className="border-b border-border/30 px-4 py-3">
            <p className="font-heading text-sm font-semibold text-foreground/90">{scenePlaybook?.name ?? sceneProfile?.name ?? sceneProfile?.id}</p>
            <p className="mt-1 text-xs text-muted-foreground/70 line-clamp-2">{scenePlaybook?.description ?? sceneProfile?.description ?? ""}</p>
            <p className="mt-2 text-[11px] text-muted-foreground/60">修改选项后点"重新发送"可再次向 Agent 发起场景任务。</p>
            {scenePlaybook && !scenePlaybook.builtin ? (
              <Link to={`/scenes/${encodeURIComponent(scenePlaybook.id)}/detail`} className="mt-2 inline-block text-xs text-primary/80 hover:text-primary">查看配置</Link>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <PlaybookInputForm
              profileId={sceneProfile!.id} profile={sceneProfile!}
              formId="chat-scene-form" hideSubmitButton
              disabled={isGenerating}
              onValuesChange={setSceneSlotValues}
              onSubmit={() => {}}
            />
          </div>
          <div className="shrink-0 border-t border-border/30 p-4">
            <Button
              className="h-10 w-full gap-2 rounded-xl"
              disabled={isGenerating || !sceneFilled}
              onClick={doSend}
            >
              <Zap className="size-4" />
              重新发送
            </Button>
          </div>
        </aside>
      ) : null}
      {permissionDialog}
    </div>
  )
}