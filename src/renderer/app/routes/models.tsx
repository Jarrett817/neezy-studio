import { Link } from "react-router"

import { Layers, Loader2, Sparkles, Zap } from "lucide-react"

import { useQuery, useQueryClient } from "@tanstack/react-query"



import { ModelCatalogSection } from "~/components/models/model-catalog-section"

import { OllamaActiveModelBar } from "~/components/models/ollama-active-model-bar"

import { OllamaStatusPanel } from "~/components/models/ollama-status-panel"

import { ModelRecommendationBanner } from "~/components/model-oracle-panel"

import { Button } from "~/components/ui/button"

import { cn } from "~/lib/utils"

import { useLlmModels } from "~/hooks/use-llm-models"

import { getRuntimeSettings } from "~/services/settings"



const KIND_TABS = [

  { kind: "chat" as const, label: "对话模型", icon: Sparkles },

  { kind: "embedding" as const, label: "Embedding", icon: Layers },

] as const



export default function ModelsRoute() {

  const queryClient = useQueryClient()

  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 0,
  })

  const useRemoteChat =

    runtimeSettings?.llmProvider.kind === "openai-compatible"



  const {

    kind,

    setKind,

    localChatItems,

    localEmbeddingItems,

    recommendedChatItems,

    recommendedEmbeddingItems,

    isRecommendedCatalogLoading,

    metrics,

    selectedId,

    toggleSelectedId,

    recommendedId,

    activeFileName,

    loadingFileName,

    currentChat,

    currentEmbedding,

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

    handleStartEmbedding,

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

          下载、删除、测试 Ollama 模型；选择当前对话与 Embedding 模型。基于 ollama.js（list /

          pull / delete / chat / embed）。

        </p>

        {useRemoteChat ? (

          <p className="text-sm text-muted-foreground">

            对话当前走{" "}

            <strong className="font-medium text-foreground">API</strong>（

            {runtimeSettings?.llmProvider.model || "未配置"}），可在{" "}

            <Link to="/connect" className="font-medium text-primary hover:underline">

              AI 连接

            </Link>{" "}

            切换为本地 Ollama。下方仍可管理本机模型与 Embedding。

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

        localEmbeddingItems={localEmbeddingItems}

        currentChat={currentChat}

        currentEmbedding={currentEmbedding}

        onSelectChat={(item) => void handleStartChat(item)}

        onSelectEmbedding={(item) => void handleStartEmbedding(item)}

      />



      <div className="flex flex-wrap items-center gap-3">

        <div className="flex flex-1 gap-1 rounded-2xl border border-border/60 bg-card p-1 shadow-sm">

          {KIND_TABS.map(({ kind: tabKind, label, icon: Icon }) => (

            <button

              key={tabKind}

              type="button"

              onClick={() => setKind(tabKind)}

              className={cn(

                "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors",

                kind === tabKind

                  ? "bg-primary text-primary-foreground shadow-sm"

                  : "text-muted-foreground hover:bg-muted/50"

              )}

            >

              <Icon className="size-4" />

              {label}

            </button>

          ))}

        </div>

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



      {kind === "chat" ? (

        <div className="space-y-8">

          <ModelCatalogSection

            title="本机已下载"

            description="选中后点「启动」载入对话；烧瓶图标可快速测试连通性。"

            kind="chat"

            items={localChatItems}

            emptyText="尚未下载对话模型，请从下方推荐列表下载。"

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

      ) : (

        <div className="space-y-8">

          <ModelCatalogSection

            title="本机已下载"

            description="选用后用于记忆向量检索；烧瓶图标测试 embed。"

            kind="embedding"

            items={localEmbeddingItems}

            emptyText="尚未下载 Embedding 模型。"

            isLoading={isRefreshing && localEmbeddingItems.length === 0}

            {...cardHandlers}

          />

          <ModelCatalogSection

            title="推荐下载"

            description="用于记忆向量检索，建议优先选用推荐项。"

            kind="embedding"

            items={recommendedEmbeddingItems}

            isLoading={isRecommendedCatalogLoading}

            emptyText="推荐列表暂不可用，请刷新。"

            {...cardHandlers}

          />

        </div>

      )}

    </div>

  )

}


