import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Download, FolderOpen, RefreshCw, Trash2, Upload } from "lucide-react"

import { useMemo, useState } from "react"

import { toast } from "sonner"



import { Button } from "~/components/ui/button"

import { Badge } from "~/components/ui/badge"

import {

  importSkillFromPath,

  importSkillsFromDrop,

  installSkill,

  searchSkillCatalog,

  uninstallSkill,
  type InstalledSkill,
} from "~/services/skills"

import { listSkills, type AgentSkill } from "~/services/workspace"

import { getElectronApi } from "~/services/electron-client"

import {

  SKILL_CATALOG_PUBLISHER_IDS,

  SKILL_PUBLISHERS,

  type SkillCatalogPublisherId,

} from "../../../shared/skill-registry"

import { cn } from "~/lib/utils"



export default function SkillsRoute() {

  const queryClient = useQueryClient()

  const [publisher, setPublisher] = useState<SkillCatalogPublisherId>("anthropic")

  const [dragOver, setDragOver] = useState(false)



  const { data: catalog = [], isLoading: loadingCatalog } = useQuery({

    queryKey: ["skills-catalog", ""],

    queryFn: () => searchSkillCatalog(""),

  })



  const { data: installed = [] } = useQuery({

    queryKey: ["skills"],

    queryFn: listSkills,

  })



  const refresh = () => {

    void queryClient.invalidateQueries({ queryKey: ["skills"] })

    void queryClient.invalidateQueries({ queryKey: ["skills-catalog"] })

  }



  const installMutation = useMutation({

    mutationFn: installSkill,

    onSuccess: (skill) => {

      toast.success(`已安装 ${skill.name}`)

      refresh()

    },

    onError: (err: Error) => toast.error(err.message || "安装失败"),

  })



  const importMutation = useMutation({
    mutationFn: async (paths: string[]): Promise<InstalledSkill[]> => {
      const results: InstalledSkill[] = []
      for (const sourcePath of paths) {
        results.push(await importSkillFromPath(sourcePath))
      }
      return results
    },

    onSuccess: (skills) => {

      toast.success(`已导入 ${skills.length} 个 skill`)

      refresh()

    },

    onError: (err: Error) => toast.error(err.message || "导入失败"),

  })



  const dropMutation = useMutation({

    mutationFn: importSkillsFromDrop,

    onSuccess: (skills) => {

      toast.success(`已导入 ${skills.length} 个 skill`)

      refresh()

    },

    onError: (err: Error) => toast.error(err.message || "导入失败"),

  })



  const uninstallMutation = useMutation({

    mutationFn: uninstallSkill,

    onSuccess: () => {

      toast.success("已卸载")

      refresh()

    },

    onError: (err: Error) => toast.error(err.message || "卸载失败"),

  })



  const importing =

    importMutation.isPending || dropMutation.isPending || installMutation.isPending



  const installedKeys = new Set(installed.map((s) => s.id))



  const catalogByPublisher = useMemo(() => {

    const map = new Map<SkillCatalogPublisherId, typeof catalog>()

    for (const id of SKILL_CATALOG_PUBLISHER_IDS) map.set(id, [])

    for (const entry of catalog) {

      if (entry.publisher === "local") continue

      map.get(entry.publisher as SkillCatalogPublisherId)?.push(entry)

    }

    return map

  }, [catalog])



  const visibleCatalog = catalogByPublisher.get(publisher) ?? []



  const onPickFolder = async () => {

    try {

      const dir = await getElectronApi().pickDirectory({ title: "选择 skill 文件夹" })

      if (!dir) return

      importMutation.mutate([dir])

    } catch (e) {

      toast.error(e instanceof Error ? e.message : "选择文件夹失败")

    }

  }



  const onDrop = (e: React.DragEvent) => {

    e.preventDefault()

    setDragOver(false)

    const files = [...e.dataTransfer.files]

    if (files.length === 0) return

    dropMutation.mutate(files)

  }



  return (

    <div className="w-full space-y-6 pt-4">

      <div className="flex items-start justify-between gap-4">

        <div>

          <h1 className="text-lg font-semibold">Skill 目录</h1>

          <p className="mt-1 text-sm text-muted-foreground">

            官方目录可一键安装；也可拖入含 SKILL.md 的文件夹（或 SKILL.md 本身）本地导入。

          </p>

        </div>

        <Button variant="ghost" size="icon" className="rounded-full" onClick={refresh}>

          <RefreshCw className="size-4" />

        </Button>

      </div>



      <div

        className={cn(

          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",

          dragOver ? "border-primary bg-primary/5" : "border-border/70 bg-muted/15"

        )}

        onDragOver={(e) => {

          e.preventDefault()

          setDragOver(true)

        }}

        onDragLeave={() => setDragOver(false)}

        onDrop={onDrop}

      >

        <div className="flex size-12 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/60">

          <Upload className="size-6 text-primary" />

        </div>

        <div>

          <p className="text-sm font-medium">拖入 skill 文件夹</p>

          <p className="mt-1 text-xs text-muted-foreground">

            需包含 SKILL.md · 落盘至 skills/local/

          </p>

        </div>

        <Button

          type="button"

          variant="outline"

          size="sm"

          className="rounded-xl"

          disabled={importing}

          onClick={() => void onPickFolder()}

        >

          <FolderOpen className="size-4" />

          选择文件夹

        </Button>

      </div>



      {installed.length > 0 ? (

        <section className="space-y-2">

          <h2 className="text-sm font-medium text-muted-foreground">已安装</h2>

          {installed.map((skill) => (

            <InstalledSkillRow

              key={skill.id}

              skill={skill}

              busy={uninstallMutation.isPending}

              onUninstall={() => uninstallMutation.mutate(skill.id)}

            />

          ))}

        </section>

      ) : null}



      <section className="space-y-3">

        <div className="flex flex-wrap items-center gap-2">

          <h2 className="text-sm font-medium text-muted-foreground">官方目录</h2>

          <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">

            {SKILL_CATALOG_PUBLISHER_IDS.map((id) => (

              <button

                key={id}

                type="button"

                className={cn(

                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",

                  publisher === id

                    ? "bg-primary text-primary-foreground"

                    : "text-muted-foreground hover:bg-background/80"

                )}

                onClick={() => setPublisher(id)}

              >

                {SKILL_PUBLISHERS[id].label}

              </button>

            ))}

          </div>

        </div>

        <p className="text-xs text-muted-foreground">

          {SKILL_PUBLISHERS[publisher].description}

        </p>

        {loadingCatalog ? (

          <p className="text-sm text-muted-foreground">加载中…</p>

        ) : visibleCatalog.length === 0 ? (

          <p className="text-sm text-muted-foreground">暂无条目（请检查 API Key 或网络）</p>

        ) : (

          visibleCatalog.map((entry) => (

            <div

              key={entry.installKey}

              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"

            >

              <div className="min-w-0 flex-1">

                <div className="flex flex-wrap items-center gap-2">

                  <p className="text-sm font-semibold">{entry.title ?? entry.id}</p>

                  <Badge variant="outline" className="font-mono text-[10px]">

                    {entry.installKey}

                  </Badge>

                  {entry.source === "github" ? (

                    <Badge variant="secondary" className="text-[10px]">

                      GitHub

                    </Badge>

                  ) : null}

                  {installedKeys.has(entry.installKey) ? (

                    <Badge variant="secondary">已安装</Badge>

                  ) : null}

                </div>

                <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>

              </div>

              {installedKeys.has(entry.installKey) ? (

                <Button

                  variant="outline"

                  size="sm"

                  disabled={uninstallMutation.isPending}

                  onClick={() => uninstallMutation.mutate(entry.installKey)}

                >

                  <Trash2 className="size-3.5" />

                  卸载

                </Button>

              ) : (

                <Button

                  size="sm"

                  disabled={importing}

                  onClick={() => installMutation.mutate(entry.installKey)}

                >

                  <Download className="size-3.5" />

                  安装

                </Button>

              )}

            </div>

          ))

        )}

      </section>

    </div>

  )

}



function InstalledSkillRow({

  skill,

  busy,

  onUninstall,

}: {

  skill: AgentSkill

  busy: boolean

  onUninstall: () => void

}) {

  const isLocal = skill.sourceKind === "local"

  return (

    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">

      <div className="min-w-0 flex-1">

        <div className="flex flex-wrap items-center gap-2">

          <p className="text-sm font-medium">{skill.name}</p>

          {isLocal ? (

            <Badge variant="outline" className="text-[10px]">

              本地

            </Badge>

          ) : null}

        </div>

        <p className="text-xs text-muted-foreground line-clamp-1">{skill.description}</p>

      </div>

      <Button variant="ghost" size="sm" disabled={busy} onClick={onUninstall}>

        <Trash2 className="size-3.5" />

        卸载

      </Button>

    </div>

  )

}


