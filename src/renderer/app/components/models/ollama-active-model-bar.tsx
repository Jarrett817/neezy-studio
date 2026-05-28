import { Link } from "react-router"
import { Sparkles, Layers } from "lucide-react"

import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import type { ModelCatalogItem } from "~/services/electron-client"

const NONE = "__none__"

export function OllamaActiveModelBar({
  useRemoteChat,
  localChatItems,
  localEmbeddingItems,
  currentChat,
  currentEmbedding,
  onSelectChat,
  onSelectEmbedding,
}: {
  useRemoteChat: boolean
  localChatItems: ModelCatalogItem[]
  localEmbeddingItems: ModelCatalogItem[]
  currentChat: string | null
  currentEmbedding: string | null
  onSelectChat: (item: ModelCatalogItem) => void
  onSelectEmbedding: (item: ModelCatalogItem) => void
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:grid-cols-2">
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-primary" />
          对话模型
        </Label>
        {useRemoteChat ? (
          <p className="text-xs text-muted-foreground">
            当前对话走 API，在{" "}
            <Link to="/connect" className="text-primary hover:underline">
              AI 连接
            </Link>{" "}
            配置。此处仍可下载/测试本地对话模型，切换回 Ollama 后即可选用。
          </p>
        ) : null}
        <Select
          value={currentChat ?? NONE}
          onValueChange={(value) => {
            if (value === NONE) return
            const item = localChatItems.find((i) => i.fileName === value)
            if (item) onSelectChat(item)
          }}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue
              placeholder={
                localChatItems.length === 0
                  ? "请先下载对话模型"
                  : "选择对话模型"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {localChatItems.length === 0 ? (
              <SelectItem value={NONE} disabled>
                暂无已下载对话模型
              </SelectItem>
            ) : (
              localChatItems.map((item) => (
                <SelectItem key={item.id} value={item.fileName}>
                  {item.title}
                  {currentChat === item.fileName ? "（当前）" : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Layers className="size-4 text-primary" />
          Embedding 模型
        </Label>
        <p className="text-xs text-muted-foreground">用于记忆向量检索</p>
        <Select
          value={currentEmbedding ?? NONE}
          onValueChange={(value) => {
            if (value === NONE) return
            const item = localEmbeddingItems.find((i) => i.fileName === value)
            if (item) onSelectEmbedding(item)
          }}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue
              placeholder={
                localEmbeddingItems.length === 0
                  ? "请先下载 Embedding"
                  : "选择 Embedding"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {localEmbeddingItems.length === 0 ? (
              <SelectItem value={NONE} disabled>
                暂无已下载 Embedding
              </SelectItem>
            ) : (
              localEmbeddingItems.map((item) => (
                <SelectItem key={item.id} value={item.fileName}>
                  {item.title}
                  {currentEmbedding === item.fileName ? "（当前）" : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
