import { Link } from "react-router"
import { Loader2, Sparkles, Zap } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { ModelCatalogSection } from "~/components/models/model-catalog-section"
import { OllamaActiveModelBar } from "~/components/models/ollama-active-model-bar"
import { OllamaStatusPanel } from "~/components/models/ollama-status-panel"
import { ModelRecommendationBanner } from "~/components/model-oracle-panel"
import { Button } from "~/components/ui/button"
import { useLlmModels } from "~/hooks/use-llm-models"
import { getRuntimeSettings } from "~/services/settings"

export default function ModelsRoute() {
  const queryClient = useQueryClient()
  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 0,
  })
  const useRemoteChat = false

  const {
    localChatItems,
    recommendedChatItems,
    isRecommendedCatalogLoading,
    metrics,
    selectedId,
    toggleSelectedId,
    recommendedId,
    activeFileName,
    loadingFileName,
    currentChat,
    isRefreshing,
    catalogIsError,
    catalogError,
    refresh,
    handleDownload,
    handleCancelDownload,
    handleDelete,
    handleTest,
    testingFileName,
    toggleModelRun,
    handleStartChat,
  } = useLlmModels()

  const cardHandlers = {
    selectedId,
    metrics,
    recommendedId,
    activeFileName,
    loadingFileName,
    onSelect: toggleSelectedId,
    onDownload: handleDownload,
    onCancelDownload: handleCancelDownload,
    onToggleRun: toggleModelRun,
    onDelete: handleDelete,
    onTest: handleTest,
    testingFileName,
  }

  const refreshAll = () => {
    void refresh()
    void queryClient.invalidateQueries({ queryKey: ["ollama-status"] })
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 pb-8 pt-2">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">本地模型</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          通过 Ollama 拉取、删除、测试对话模型（本应用只调用 Ollama API，不管理模型文件路径）。记忆向量使用内置 Embedding。
        </p>
        {useRemoteChat ? (
          <p className="text-sm text-muted-foreground">
            对话当前走{" "}
            <strong className="font-medium text-foreground">API</strong>（
            {runtimeSettings?.llmProvider.model || "未配置"}），可在{" "}
            <Link to="/connect" className="font-medium text-primary hover:underline">
              AI 连接
            </Link>{" "}
            切换为本地 Ollama。下方仍可管理本机对话模型。
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            对话走<strong className="font-medium text-foreground">本地 Ollama</strong>
            ，请在上方选择对话模型并启动，或在下方的卡片中操作。
          </p>
        )}
      </header>

      <OllamaStatusPanel
        onRefreshCatalog={refreshAll}
        isRefreshingCatalog={isRefreshing}
      />

      <OllamaActiveModelBar
        useRemoteChat={useRemoteChat}
        localChatItems={localChatItems}
        currentChat={currentChat}
        onSelectChat={(item) => void handleStartChat(item)}
      />

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-xl border-border/60"
          onClick={refreshAll}
          disabled={isRefreshing}
          aria-label="刷新模型列表"
        >
          {isRefreshing ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Zap className="size-5" />
          )}
        </Button>
      </div>

      {catalogIsError ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {catalogError instanceof Error
            ? catalogError.message
            : "无法加载模型列表，请确认 Ollama 已安装并运行后点击刷新。"}
        </p>
      ) : null}

      {metrics ? (
        <div className="space-y-2">
          {metrics.gpuInspectLines?.length ? (
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
              {metrics.gpuInspectLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          <ModelRecommendationBanner metrics={metrics} />
        </div>
      ) : isRefreshing ? (
        <p className="text-sm text-muted-foreground">正在读取本机配置与推荐模型…</p>
      ) : null}

      <div className="space-y-8">
        <ModelCatalogSection
          title="本机可用"
          description="含 Ollama 已安装与本应用内下载的模型；选中后点「启动」载入对话。"
          kind="chat"
          items={localChatItems}
          emptyText="本机尚无可用对话模型：可在下方推荐列表下载，或在 Ollama 中 pull 后点刷新。"
          isLoading={isRefreshing && localChatItems.length === 0}
          {...cardHandlers}
        />

        <ModelCatalogSection
          title="推荐下载"
          description="按内存与 Ollama 库精选；带「推荐」角标为系统首选。"
          kind="chat"
          items={recommendedChatItems}
          isLoading={isRecommendedCatalogLoading}
          emptyText="推荐列表暂不可用，请确认 Ollama 已运行后点击刷新。"
          {...cardHandlers}
        />
      </div>
    </div>
  )
}
