"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { useAppStore } from "@/store/app-store"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ModelParams } from "@/components/model-params"
import { FolderOpen, FileText, Upload, Trash2, Loader2, Save, Edit, Bot } from "lucide-react"

// 自动调整textarea高度的组件
const AutoResizeTextarea = ({
  value,
  onChange,
  placeholder,
  className = "",
  maxRows = 20,
  disabled = false
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder: string
  className?: string
  maxRows?: number
  disabled?: boolean
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // 重置高度到初始状态以便正确计算
    textarea.style.height = 'auto'

    // 计算滚动高度
    const scrollHeight = textarea.scrollHeight

    // 计算行高
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight)

    // 计算需要的行数
    const neededRows = Math.ceil(scrollHeight / lineHeight)

    // 限制最大行数
    const maxAllowedRows = Math.min(neededRows, maxRows)

    // 设置新高度
    const newHeight = maxAllowedRows * lineHeight
    textarea.style.height = `${newHeight}px`
  }, [maxRows])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e)
        adjustHeight()
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full bg-transparent border-0 border-b border-border px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none min-h-[2rem] max-h-[40rem] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      rows={1}
    />
  )
}

export function ProjectOverview() {
  const {
    projectConfig: {
      systemPrompt,
      knowledgeBaseFiles,
      knowledgeBaseFileData,
      isDragging,
      parseError,
      isLoading,
      isEditMode,
      showSuccess,
      workModel,
      workModelParams
    },
    modelSettingsConfig: {
      models,
      providers
    },
    setSystemPrompt,
    setKnowledgeBaseFiles,
    setKnowledgeBaseFileData,
    setIsDragging,
    setParseError,
    setProjectLoading,
    setIsEditMode,
    setShowSuccess,
    setModels,
    setProviders,
    setWorkModel,
    setWorkModelParams
  } = useAppStore()

  // 加载项目配置和模型配置
  useEffect(() => {
    const loadProjectConfig = async () => {
      try {
        // 读取project.md文件
        const response = await fetch('/api/save-project')

        if (response.ok) {
          const data = await response.json()
          if (data.exists && data.content) {
            // 解析project.md内容
            const lines = data.content.split('\n')
            let currentSection = ""
            let jsonContent = ""
            let inJsonBlock = false

            const config = {
              systemPrompt: "",
              workModel: "",
              workModelParams: null
            }

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]

              if (line.startsWith('## ')) {
                currentSection = line.substring(3).trim()
                inJsonBlock = false
                continue
              }

              if (line.startsWith('```')) {
                if (inJsonBlock) {
                  try {
                    if (currentSection === "工作模型参数" && jsonContent.trim()) {
                      config.workModelParams = JSON.parse(jsonContent.trim())
                    }
                  } catch (error) {
                    console.error("Error parsing JSON content:", error)
                  }
                  jsonContent = ""
                  inJsonBlock = false
                } else {
                  inJsonBlock = true
                  jsonContent = ""
                }
                continue
              }

              if (inJsonBlock) {
                jsonContent += line + '\n'
                continue
              }

              if (currentSection === "系统提示词") {
                if (line.trim() && !line.startsWith('#')) {
                  config.systemPrompt += line + '\n'
                }
              } else if (currentSection === "工作模型配置") {
                if (line.includes('### 工作模型') && !line.includes('### 工作模型参数')) {
                  const nextLine = lines[i + 1]
                  if (nextLine && nextLine.trim() && nextLine.trim() !== '未设置') {
                    config.workModel = nextLine.trim()
                  }
                }
              }
            }

            config.systemPrompt = config.systemPrompt.trim()

            // 设置到store中
            if (config.systemPrompt) {
              setSystemPrompt(config.systemPrompt)
            }
            if (config.workModel) {
              setWorkModel(config.workModel)
            }
            if (config.workModelParams) {
              setWorkModelParams(config.workModelParams)
            }

            console.log('Project config loaded from file:', config)
          }
        }
      } catch (error) {
        console.error('Error loading project config:', error)
      }
    }

    const loadModels = async () => {
      try {
        const response = await fetch('/api/models')
        if (!response.ok) {
          throw new Error('Failed to load model configurations')
        }

        const data = await response.json()
        const { providers, models: allModels, defaultModels } = data

        const providerConfigs: {[key: string]: any} = {}

        // 转换API返回的数据格式
        Object.entries(providers).forEach(([provider, config]: [string, any]) => {
          providerConfigs[provider] = {
            apiKey: config.apiKey,
            modelList: config.modelList,
            displayName: config.displayName,
            color: config.color
          }
        })

        setProviders(providerConfigs)
        setModels(allModels)

        // 只在没有设置工作模型时才设置默认值
        const isValidModel = (modelName: string) => allModels.some((model: any) => model.name === modelName)

        // 检查是否需要设置默认模型（只有在没有持久化数据或者数据无效时才设置）
        const shouldSetDefaults = !workModel || !isValidModel(workModel)

        if (shouldSetDefaults) {
          console.log('Setting default work model:', defaultModels.workModel)

          // 强制设置默认值
          const workModelToSet = isValidModel(defaultModels.workModel) ? defaultModels.workModel : allModels[0]?.name || ''
          setWorkModel(workModelToSet)

          // 同时设置默认的工作模型参数
          if (!workModelParams) {
            setWorkModelParams({
              streamingEnabled: true,
              temperature: [1.0],
              topP: [1.0],
              presencePenalty: [0.0],
              frequencyPenalty: [0.0],
              singleResponseLimit: false,
              maxTokens: [0],
              maxTokensInput: "0",
              intelligentAdjustment: false,
              reasoningEffort: "中"
            })
          }
        }
      } catch (error) {
        console.error('Error loading model configurations:', error)
      }
    }

  // 并行加载项目配置和模型配置
    const shouldLoadModels = !models || models.length === 0
    if (shouldLoadModels) {
      console.log('Loading project and model configurations...')
      loadProjectConfig() // 先加载项目配置
      loadModels()       // 再加载模型配置
    } else {
      // 即使模型已加载，也要确保项目配置已加载
      loadProjectConfig()
    }
  }, [models?.length])

  // 获取模型提供商显示名称
  const getModelProvider = (modelName: string) => {
    const model = (models || []).find(m => m.name === modelName)
    if (!model || !providers[model.provider]) return ''
    return providers[model.provider]?.displayName || ''
  }

  const handleSave = async () => {
    const validationErrors = []


    if (!systemPrompt.trim()) {
      validationErrors.push("系统提示词")
    }

    if (validationErrors.length > 0) {
      const errorMessage = `请填写以下必填项目：\n• ${validationErrors.join("\n• ")}`

      // 创建自定义模态框而不是使用alert，使用项目主题色
      const modal = document.createElement('div')
      modal.className = 'fixed inset-0 flex items-center justify-center z-50'
      modal.innerHTML = `
        <div class="bg-card border border-border rounded-lg p-6 max-w-md mx-4 shadow-lg">
          <h3 class="text-lg font-semibold mb-4 text-foreground">提示</h3>
          <p class="text-muted-foreground mb-6 whitespace-pre-line">${errorMessage}</p>
          <div class="flex justify-end">
            <button id="modal-ok" class="px-4 py-2 bg-foreground text-background rounded hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-primary transition-colors">
              确定
            </button>
          </div>
        </div>
      `
      document.body.appendChild(modal)

      // 点击确定按钮关闭模态框
      const okButton = modal.querySelector('#modal-ok') as HTMLElement
      const closeModal = () => {
        document.body.removeChild(modal)
      }
      okButton.addEventListener('click', closeModal)

      // 点击背景也可以关闭
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal()
        }
      })

      // ESC键关闭
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeModal()
          document.removeEventListener('keydown', handleEscape)
        }
      }
      document.addEventListener('keydown', handleEscape)

      return
    }

    setProjectLoading(true)
    setShowSuccess(false)

    try {
      const response = await fetch("/api/save-project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemPrompt: systemPrompt.trim(),
          knowledgeBaseFiles: knowledgeBaseFiles,
          fileData: knowledgeBaseFileData,
          workModel: workModel,
          workModelParams: workModelParams
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "保存失败")
      }

      // 保存成功，切换到编辑模式
      setIsEditMode(false)
      setShowSuccess(true)

      // 3秒后隐藏成功提示
      setTimeout(() => {
        setShowSuccess(false)
      }, 3000)

      console.log("Project saved successfully:", result)
    } catch (error) {
      console.error("Error saving project:", error)
      alert(`保存失败: ${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setProjectLoading(false)
    }
  }

  const handleEdit = () => {
    setIsEditMode(true)
  }


  const handleKnowledgeBaseFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    const newFilePaths: string[] = []
    const newFileData: any[] = []

    // 处理文件读取
    const processFiles = async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = file.webkitRelativePath || file.name

        if (file.webkitRelativePath) {
          // 如果是文件夹中的文件，webkitRelativePath 会包含相对路径
          const parts = path.split('/')
          const folderName = parts[0]
          const fileName = parts.slice(1).join('/')
          const fullPath = `${folderName}/${fileName}`
          newFilePaths.push(fullPath)
        } else {
          // 单个文件
          newFilePaths.push(file.name)
        }

        // 读取文件内容
        try {
          const fileContent = await readFileAsBase64(file)
          newFileData.push({
            path: file.webkitRelativePath || file.name,
            content: fileContent,
            name: file.name,
            size: file.size,
            type: file.type
          })
        } catch (error) {
          console.error(`Error reading file ${file.name}:`, error)
        }
      }

      // 调试：打印选择的文件路径和文件数据
      console.log("选择的文件路径:", newFilePaths)
      console.log("文件数据:", newFileData)

      // 追加新文件到现有列表，避免重复
      const existingFilesSet = new Set(knowledgeBaseFiles)
      const uniqueNewFiles = newFilePaths.filter(file => !existingFilesSet.has(file))

      // 追加新文件数据到现有列表
      const existingFilesDataMap = new Map((knowledgeBaseFileData || []).map(f => [f.path, f]))
      const uniqueNewFileData = newFileData.filter(f => !existingFilesDataMap.has(f.path))

      setKnowledgeBaseFiles([...knowledgeBaseFiles, ...uniqueNewFiles])
      setKnowledgeBaseFileData([...(knowledgeBaseFileData || []), ...uniqueNewFileData])
    }

    processFiles()
  }

  // 辅助函数：将文件读取为Base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const items = e.dataTransfer.items
    if (!items) return

    const newFilePaths: string[] = []
    const newFileData: any[] = []
    const processedEntries = new Set<string>()

    // 递归处理文件系统中的条目
    const processEntry = async (entry: FileSystemEntry, relativePath = '') => {
      if (processedEntries.has(entry.fullPath)) return
      processedEntries.add(entry.fullPath)

      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry
        return new Promise<void>((resolve) => {
          fileEntry.file(async (file) => {
            const filePath = relativePath ? `${relativePath}/${file.name}` : file.name
            newFilePaths.push(filePath)

            try {
              const fileContent = await readFileAsBase64(file)
              newFileData.push({
                path: filePath,
                content: fileContent,
                name: file.name,
                size: file.size,
                type: file.type
              })
            } catch (error) {
              console.error(`Error reading file ${file.name}:`, error)
            }
            resolve()
          })
        })
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry
        const dirReader = dirEntry.createReader()

        return new Promise<void>((resolve) => {
          dirReader.readEntries(async (entries) => {
            for (const entry of entries) {
              const newRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name
              await processEntry(entry, newRelativePath)
            }
            resolve()
          })
        })
      }
    }

    // 处理拖拽的项目
    const processDroppedItems = async () => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const entry = item.webkitGetAsEntry()

        if (entry) {
          if (entry.isFile) {
            // 处理单个文件
            await processEntry(entry)
          } else if (entry.isDirectory) {
            // 处理文件夹 - 递归获取所有文件
            await processEntry(entry, entry.name)
          }
        }
      }

      // 调试：打印拖拽的文件路径和文件数据
      console.log("拖拽的文件路径:", newFilePaths)
      console.log("拖拽的文件数据:", newFileData)

      // 追加新文件到现有列表，避免重复
      const existingFilesSet = new Set(knowledgeBaseFiles)
      const uniqueNewFiles = newFilePaths.filter(file => !existingFilesSet.has(file))

      // 追加新文件数据到现有列表
      const existingFilesDataMap = new Map((knowledgeBaseFileData || []).map(f => [f.path, f]))
      const uniqueNewFileData = newFileData.filter(f => !existingFilesDataMap.has(f.path))

      setKnowledgeBaseFiles([...knowledgeBaseFiles, ...uniqueNewFiles])
      setKnowledgeBaseFileData([...(knowledgeBaseFileData || []), ...uniqueNewFileData])
    }

    processDroppedItems()
  }

  const clearKnowledgeBaseFiles = () => {
    setKnowledgeBaseFiles([])
    setKnowledgeBaseFileData([])
  }


  return (
    <div className="p-4 md:p-8 max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto">
      <div className="mb-6 border-b border-border pb-4 md:mb-8">
        <h1 className="text-xl font-semibold text-foreground md:text-2xl">项目配置</h1>
      </div>

      <div className="space-y-6 md:space-y-8">

        <div className="space-y-2">
          <Label className="text-lg font-medium text-foreground">系统提示词</Label>
          <AutoResizeTextarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="请输入真实项目的系统提示词，模拟真实项目背景，以获得最真实的生成环境测试结果..."
            disabled={!isEditMode || isLoading}
          />
        </div>

        {/* 知识库区域 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <h2 className="text-lg font-medium text-foreground">知识库</h2>
                <p className="text-sm text-muted-foreground">选择文件或文件夹作为知识库</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                onChange={handleKnowledgeBaseFileSelect}
                className="hidden"
                id="knowledge-base-file-select"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById('knowledge-base-file-select')?.click()}
                className="flex items-center gap-2 disabled:opacity-50"
                disabled={!isEditMode || isLoading}
              >
                <Upload className="h-4 w-4" />
                选择文件
              </Button>
            </div>
          </div>

          {/* 拖拽区域 */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : !isEditMode || isLoading
                ? 'border-muted bg-muted/20 cursor-not-allowed'
                : 'border-border hover:border-primary/50 hover:bg-primary/5'
            }`}
            onDragOver={!isEditMode || isLoading ? undefined : handleDragOver}
            onDragLeave={!isEditMode || isLoading ? undefined : handleDragLeave}
            onDrop={!isEditMode || isLoading ? undefined : handleDrop}
          >
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              拖拽文件或文件夹到此处，或点击上方按钮
            </p>
            <p className="text-xs text-muted-foreground">
              选择单个文件
            </p>
          </div>

          {/* 选择的文件路径显示 */}
          {(knowledgeBaseFiles || []).length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  已选择的文件 ({(knowledgeBaseFiles || []).length})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearKnowledgeBaseFiles}
                  className="text-xs disabled:opacity-50"
                  disabled={!isEditMode || isLoading}
                >
                  清除
                </Button>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 max-h-60 overflow-y-auto">
                {(knowledgeBaseFiles || []).map((filePath, index) => (
                  <div key={index} className="flex items-center gap-2 py-1">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-foreground font-mono break-all">
                      {filePath}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 工作模型配置 */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium text-foreground">工作模型配置</h2>
            </div>
            <p className="text-sm text-muted-foreground">选择用于执行任务的大模型</p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-foreground">工作模型</Label>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {workModel ? getModelProvider(workModel) : '无可用模型'}
                </div>
              </div>
              <Select value={workModel} onValueChange={setWorkModel} disabled={!isEditMode || isLoading}>
                <SelectTrigger className="w-full md:w-80">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  {(models || []).map((model) => (
                    <SelectItem key={model.name} value={model.name}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${model.color === 'gray' ? 'bg-gray-500' : model.color === 'blue' ? 'bg-blue-500' : model.color === 'green' ? 'bg-green-500' : model.color === 'red' ? 'bg-red-500' : model.color === 'yellow' ? 'bg-yellow-500' : 'bg-purple-500'}`}></div>
                        {model.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 工作模型参数设置 */}
          <ModelParams
            config={workModelParams}
            onChange={setWorkModelParams}
            title="工作模型参数设置"
            defaultExpanded={false}
          />
        </div>

        <div className="flex justify-end gap-4 pt-4">
          {showSuccess && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-md">
              <Save className="h-4 w-4" />
              <span className="text-sm">应用成功</span>
            </div>
          )}

          <Button
            onClick={isEditMode ? handleSave : handleEdit}
            className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : isEditMode ? (
              <>
                <Save className="h-4 w-4 mr-2" />
                应用
              </>
            ) : (
              <>
                <Edit className="h-4 w-4 mr-2" />
                编辑
              </>
            )}
          </Button>
        </div>
      </div>

      </div>
  )
}