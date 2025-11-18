import { create } from 'zustand'
import { persist } from 'zustand/middleware'


// 模型参数接口
interface ModelParams {
  streamingEnabled: boolean
  temperature: number[]
  topP: number[]
  presencePenalty: number[]
  frequencyPenalty: number[]
  singleResponseLimit: boolean
  maxTokens: number[]
  maxTokensInput: string
  intelligentAdjustment: boolean
  reasoningEffort: string
}

// 模型配置接口
interface ModelConfig {
  name: string
  provider: string
  color: string
}

interface ProviderConfig {
  apiKey: string
  modelList: string[]
  displayName: string
  color: string
}

// 运行状态接口
interface RunStatus {
  isRunning: boolean
  startTime?: Date
  endTime?: Date
  error?: string
}

// 当前运行任务状态
interface CurrentRunState {
  loop?: number;
  totalLoops?: number;
  questionId?: number;
  questionText?: string;
  modelAnswer?: string;
  score?: number;
  maxScore?: number;
}

// 全局状态接口
interface AppState {
  // UI 状态
  activeSection: string
  sidebarCollapsed: boolean
  isMobile: boolean

  // 项目概况状态
  projectConfig: {
    qaSystemPrompt: string
    chunkSystemPrompt: string
    documentSystemPrompt: string
    comprehensiveSystemPrompt: string
    knowledgeBaseFiles: string[]
    knowledgeBaseFileData: any[]
    isDragging: boolean
    parseError: string
    isLoading: boolean
    isEditMode: boolean
    showSuccess: boolean
    // 工作模型配置（从modelSettingsConfig移过来）
    workModel: string
    workModelParams: ModelParams
  }

  // 模型设置状态
  modelSettingsConfig: {
    models: ModelConfig[]
    providers: { [key: string]: ProviderConfig }
  }

  // 运行结果状态
  runResultsConfig: {
    runStatus: RunStatus
    qaQuestionCount: number
    chunkQuestionCount: number
    documentQuestionCount: number
    comprehensiveQuestionCount: number
    // 用于跟踪进度的状态
    currentTask: number
    totalTasks: number
    progress: number
    isExecuting: boolean
    isCancelled: boolean
    activeTaskMessage: string
    currentRunState: CurrentRunState
  }

  // Actions
  // UI Actions
  setActiveSection: (section: string) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setIsMobile: (mobile: boolean) => void

  // Project Actions
  updateProjectConfig: (config: Partial<AppState['projectConfig']>) => void
  setQaSystemPrompt: (prompt: string) => void
  setChunkSystemPrompt: (prompt: string) => void
  setDocumentSystemPrompt: (prompt: string) => void
  setComprehensiveSystemPrompt: (prompt: string) => void
  setKnowledgeBaseFiles: (files: string[]) => void
  setKnowledgeBaseFileData: (fileData: any[]) => void
  setIsDragging: (dragging: boolean) => void
  setParseError: (error: string) => void
  setProjectLoading: (loading: boolean) => void
  setIsEditMode: (edit: boolean) => void
  setShowSuccess: (show: boolean) => void

  // Model Settings Actions
  updateModelSettingsConfig: (config: Partial<AppState['modelSettingsConfig']>) => void
  setModels: (models: ModelConfig[]) => void
  setProviders: (providers: { [key: string]: ProviderConfig }) => void
  setWorkModel: (model: string) => void
  setWorkModelParams: (params: ModelParams) => void

  // Run Results Actions
  updateRunResultsConfig: (config: Partial<AppState['runResultsConfig']>) => void
  setRunStatus: (status: RunStatus) => void
  startRun: () => void
  stopRun: () => void
  setRunError: (error: string) => void
  setQaQuestionCount: (count: number) => void
  setChunkQuestionCount: (count: number) => void
  setDocumentQuestionCount: (count: number) => void
  setComprehensiveQuestionCount: (count: number) => void
  // 用于更新进度的 Actions
  setCurrentTask: (task: number) => void
  setTotalTasks: (tasks: number) => void
  setProgress: (progress: number) => void
  setIsExecuting: (executing: boolean) => void
  setIsCancelled: (cancelled: boolean) => void
  setActiveTaskMessage: (message: string) => void
  updateCurrentRunState: (newState: Partial<CurrentRunState>) => void
  clearCurrentRunState: () => void
}

// 默认模型参数
const defaultModelParams: ModelParams = {
  streamingEnabled: false,
  temperature: [1.0],
  topP: [1.0],
  presencePenalty: [0.0],
  frequencyPenalty: [0.0],
  singleResponseLimit: false,
  maxTokens: [0],
  maxTokensInput: "0",
  intelligentAdjustment: false,
  reasoningEffort: "中"
}

// 创建 Zustand store
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // UI 状态默认值
      activeSection: "project-overview",
      sidebarCollapsed: false,
      isMobile: false,

      // 项目概况默认值
      projectConfig: {
        qaSystemPrompt: "",
        chunkSystemPrompt: "",
        documentSystemPrompt: "",
        comprehensiveSystemPrompt: "",
        knowledgeBaseFiles: [],
        knowledgeBaseFileData: [],
        isDragging: false,
        parseError: "",
        isLoading: false,
        isEditMode: true,
        showSuccess: false,
        workModel: "",
        workModelParams: { ...defaultModelParams }
      },

      // 模型设置默认值
      modelSettingsConfig: {
        models: [],
        providers: {}
      },

      // 运行结果默认值
      runResultsConfig: {
        runStatus: {
          isRunning: false
        },
        qaQuestionCount: 3,
        chunkQuestionCount: 3,
        documentQuestionCount: 5,
        comprehensiveQuestionCount: 30,
        currentTask: 0,
        totalTasks: 0,
        progress: 0,
        isExecuting: false,
        isCancelled: false,
        activeTaskMessage: "",
        currentRunState: {}
      },

      // UI Actions
      setActiveSection: (section) => set({ activeSection: section }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setIsMobile: (mobile) => set({ isMobile: mobile }),

      // Project Actions
      updateProjectConfig: (config) =>
        set((state) => ({
          projectConfig: { ...state.projectConfig, ...config }
        })),

      setQaSystemPrompt: (prompt) =>
        get().updateProjectConfig({ qaSystemPrompt: prompt }),

      setChunkSystemPrompt: (prompt) =>
        get().updateProjectConfig({ chunkSystemPrompt: prompt }),

      setDocumentSystemPrompt: (prompt) =>
        get().updateProjectConfig({ documentSystemPrompt: prompt }),

      setComprehensiveSystemPrompt: (prompt) =>
        get().updateProjectConfig({ comprehensiveSystemPrompt: prompt }),

      setKnowledgeBaseFiles: (files) => 
        get().updateProjectConfig({ knowledgeBaseFiles: files }),

      setKnowledgeBaseFileData: (fileData) =>
        get().updateProjectConfig({ knowledgeBaseFileData: fileData }),

      setIsDragging: (dragging) => 
        get().updateProjectConfig({ isDragging: dragging }),


      setParseError: (error) => 
        get().updateProjectConfig({ parseError: error }),

      setProjectLoading: (loading) => 
        get().updateProjectConfig({ isLoading: loading }),

      setIsEditMode: (edit) => 
        get().updateProjectConfig({ isEditMode: edit }),

      setShowSuccess: (show) => 
        get().updateProjectConfig({ showSuccess: show }),


      // Model Settings Actions
      updateModelSettingsConfig: (config) => 
        set((state) => ({ 
          modelSettingsConfig: { ...state.modelSettingsConfig, ...config } 
        })),

      setModels: (models) => 
        get().updateModelSettingsConfig({ models }),

      setProviders: (providers) => 
        get().updateModelSettingsConfig({ providers }),

      setWorkModel: (model) =>
        get().updateProjectConfig({ workModel: model }),

      setWorkModelParams: (params) =>
        get().updateProjectConfig({ workModelParams: params }),

      // Run Results Actions
      updateRunResultsConfig: (config) => 
        set((state) => ({ 
          runResultsConfig: { ...state.runResultsConfig, ...config } 
        })),

      setRunStatus: (status) => 
        get().updateRunResultsConfig({ runStatus: status }),

      startRun: () =>
        get().setRunStatus({
          isRunning: true,
          startTime: new Date(),
          endTime: undefined,
          error: undefined 
        }),

      stopRun: () =>
        get().updateRunResultsConfig({
          runStatus: {
            ...get().runResultsConfig.runStatus, // 保留 results, startTime 等
            isRunning: false,
            endTime: new Date()
          }
        }),

      setRunError: (error) => 
        get().updateRunResultsConfig({ 
          runStatus: { ...get().runResultsConfig.runStatus, error, isRunning: false } 
        }),

      setQaQuestionCount: (count) =>
        get().updateRunResultsConfig({ qaQuestionCount: count }),

      setChunkQuestionCount: (count) =>
        get().updateRunResultsConfig({ chunkQuestionCount: count }),

      setDocumentQuestionCount: (count) =>
        get().updateRunResultsConfig({ documentQuestionCount: count }),

      setComprehensiveQuestionCount: (count) =>
        get().updateRunResultsConfig({ comprehensiveQuestionCount: count }),

      // 添加新的 Actions 实现
      setCurrentTask: (task) =>
        get().updateRunResultsConfig({ currentTask: task }),

      setTotalTasks: (tasks) =>
        get().updateRunResultsConfig({ totalTasks: tasks }),

      setProgress: (progress) =>
        get().updateRunResultsConfig({ progress }),

      setIsExecuting: (executing) =>
        get().updateRunResultsConfig({ isExecuting: executing }),

      setIsCancelled: (cancelled) =>
        get().updateRunResultsConfig({ isCancelled: cancelled }),

      setActiveTaskMessage: (message) =>
        get().updateRunResultsConfig({ activeTaskMessage: message }),

      updateCurrentRunState: (newState) =>
        set((state) => ({
          runResultsConfig: {
            ...state.runResultsConfig,
            // 使用 Object.assign 来合并新旧状态，实现覆盖
            currentRunState: { ...state.runResultsConfig.currentRunState, ...newState },
          },
        })),

      clearCurrentRunState: () =>
        set((state) => ({
          runResultsConfig: {
            ...state.runResultsConfig,
            currentRunState: {},
          },
        })),
    }),
    {
      name: 'fta-app-storage',
      // 只持久化必要的配置数据，不包含临时状态
      partialize: (state) => ({
        projectConfig: {
          qaSystemPrompt: state.projectConfig.qaSystemPrompt,
          chunkSystemPrompt: state.projectConfig.chunkSystemPrompt,
          documentSystemPrompt: state.projectConfig.documentSystemPrompt,
          comprehensiveSystemPrompt: state.projectConfig.comprehensiveSystemPrompt,
          knowledgeBaseFiles: state.projectConfig.knowledgeBaseFiles,
          workModel: state.projectConfig.workModel,
          workModelParams: state.projectConfig.workModelParams,
        },
        runResultsConfig: {
          qaQuestionCount: state.runResultsConfig.qaQuestionCount,
          chunkQuestionCount: state.runResultsConfig.chunkQuestionCount,
          documentQuestionCount: state.runResultsConfig.documentQuestionCount,
          comprehensiveQuestionCount: state.runResultsConfig.comprehensiveQuestionCount
        },
      }),
      // 在重新水合状态时确保默认值正确应用
      onRehydrateStorage: () => (state) => {
        console.log('Rehydrating state with:', state);
        if (state && state.runResultsConfig) {
          // 强制设置正确的默认值，覆盖localStorage中的旧值
          state.runResultsConfig.qaQuestionCount = 3;
          state.runResultsConfig.chunkQuestionCount = 3;
          state.runResultsConfig.documentQuestionCount = 5;
          state.runResultsConfig.comprehensiveQuestionCount = 30;
          console.log('Final state after rehydration:', state.runResultsConfig);
        }
      },
      // 添加版本控制，确保默认值更新
      version: 1,
      // 迁移函数，处理版本升级时的默认值重置
      migrate: (persistedState: any, version: number) => {
        console.log('Migrating persisted state:', persistedState, 'version:', version);
        if (version === 0) {
          // 从版本 0 升级到版本 1，确保默认值正确
          return {
            ...persistedState,
            runResultsConfig: {
              ...persistedState?.runResultsConfig,
              qaQuestionCount: 3,
              chunkQuestionCount: 3,
              documentQuestionCount: 5,
              comprehensiveQuestionCount: 30
            }
          };
        }
        return persistedState;
      },
    }
  )
)