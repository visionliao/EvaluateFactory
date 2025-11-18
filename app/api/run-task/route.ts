import { NextRequest, NextResponse } from 'next/server'
import { readFile, mkdir, writeFile, readdir } from 'fs/promises'
import { join } from 'path'
import { handleChat } from '@/lib/llm/model-service';
import { ChatMessage, LlmGenerationOptions, NonStreamingResult } from '@/lib/llm/types';
import { appendToLogFile, ensureLogFileExists } from '@/lib/server-utils';

// 安全调用大模型包装器，可以重试
interface SafeCallResult {
  success: boolean;
  content?: string;
  tokenUsage?: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
  durationUsage?: {
    total_duration: number; // 整个请求处理的总耗时（单位通常是纳秒）。包含了模型加载、提示词处理和内容生成的所有时间
    load_duration: number;  // 如果模型不在内存中，加载模型到内存所花费的时间。如果模型已经加载，这个值可能为0。
    prompt_eval_duration: number; // 处理（评估）输入提示词（prompt）所花费的时间。
    eval_duration: number;  // 生成回复内容所花费的时间。
  };
  error?: string;
}

async function safeModelCall(
  selectedModel: string,
  messages: ChatMessage[],
  options: LlmGenerationOptions,
  retries = 2 // 默认重试2次
): Promise<SafeCallResult> {
  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) {
        console.log(`[safeModelCall] Retrying... (Attempt ${i + 1})`);
        // 在重试前可以增加一个短暂的延迟
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const result = await handleChat(selectedModel, messages, options) as NonStreamingResult;

      if (result && typeof result.content === 'string') {
        return {
          success: true,
          content: result.content,
          tokenUsage: result.usage,
          durationUsage: result.duration
        };
      } else {
        // 记录非致命错误，但继续循环以重试
        const errorMessage = "Model call succeeded but returned unexpected format.";
        console.error(`[safeModelCall] Attempt ${i + 1} failed:`, errorMessage, result);
        if (i === retries) { // 如果这是最后一次重试
          return { success: false, error: errorMessage };
        }
      }
    } catch (error: any) {
      console.error(`[safeModelCall] Attempt ${i + 1} for ${selectedModel} caught a critical error:`, error);
      if (i === retries) { // 如果这是最后一次重试
        return { success: false, error: error.message || "A critical error occurred during model call" };
      }
    }
  }
  // 理论上不会执行到这里，但在 TS 中为了类型安全返回一个默认失败结果
  return { success: false, error: "Exited retry loop unexpectedly" };
}

// Helper to format date for directory name (YYMMDD_HHMMSS)
function getTimestamp() {
  const now = new Date()
  const pad = (num: number) => num.toString().padStart(2, '0')
  const year = now.getFullYear().toString().slice(-2)
  const month = pad(now.getMonth() + 1)
  const day = pad(now.getDate())
  const hours = pad(now.getHours())
  const minutes = pad(now.getMinutes())
  const seconds = pad(now.getSeconds())
  return `${year}${month}${day}_${hours}${minutes}${seconds}`
}

// Helper to send SSE messages in the correct format
function sendEvent(controller: ReadableStreamDefaultController, data: object) {
  try {
    controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
  } catch (e) {
    console.error("Failed to enqueue data, stream might be closed:", e);
  }
}

// 确保此路由在每次请求时都动态执行，而不是在构建时静态生成
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log("--- New Request Received ---");

  let config;
  try {
    config = await request.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let isAborted = false

      try {
        const runTimestamp = getTimestamp()
        const baseResultDir = join(process.cwd(), "output", "result", runTimestamp)
        await mkdir(baseResultDir, { recursive: true })

        sendEvent(controller, { type: 'log', message: `结果目录已创建: ${runTimestamp}` })

        // 监听请求取消事件
        const abortListener = () => {
          isAborted = true
          console.log("Request aborted by client.")
        }
        // 添加前端传递过来的abort监听
        request.signal.addEventListener('abort', abortListener)

        // 调用主任务执行器，传递取消检查函数
        await runTask(config, baseResultDir, (data) => {
          // 每次发送进度前检查是否已取消
          if (isAborted || request.signal.aborted) {
            throw new Error('任务已被用户取消');
          }
          sendEvent(controller, data)
        }, () => isAborted || request.signal.aborted)

        // 移除监听器
        request.signal.removeEventListener('abort', abortListener)

        if (!isAborted && !request.signal.aborted) {
          sendEvent(controller, { type: 'done', message: '所有任务已成功完成。' })
        }
      } catch (error: any) {
        if (error.message === '任务已被用户取消') {
          console.log("Task execution cancelled by user.");
          sendEvent(controller, { type: 'error', message: '任务已被用户取消。' })
        } else {
          console.error("Task execution error:", error)
          sendEvent(controller, { type: 'error', message: error.message || "发生未知错误" })
        }
      } finally {
        controller.close()
      }
    },
    cancel() {
      console.log("Stream cancelled by client.");
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// 主任务执行器
async function runTask(config: any, baseResultDir: string, onProgress: (data: object) => void, isCancelled: () => boolean = () => false) {
  // 总任务数计算公式 - 只计算工作模型调用
  const totalTasks = config.testCases.length * config.testConfig.loopCount;
  let currentTask = 0;
  let totalTokenUsage = 0; // 累计token消耗

  // 步骤 1: 整合项目背景信息
  onProgress({ type: 'log', message: `正在加载项目背景资料...` })

  // 创建基础项目上下文
  let baseProjectContext = `# QA系统提示词\n${config.project.qaSystemPrompt || ''}\n\n`

  // 如果有其他类型的系统提示词，也添加到上下文中
  if (config.project.chunkSystemPrompt) {
    baseProjectContext += `# 文本块系统提示词\n${config.project.chunkSystemPrompt}\n\n`
  }
  if (config.project.documentSystemPrompt) {
    baseProjectContext += `# 文档系统提示词\n${config.project.documentSystemPrompt}\n\n`
  }
  if (config.project.comprehensiveSystemPrompt) {
    baseProjectContext += `# 综合系统提示词\n${config.project.comprehensiveSystemPrompt}\n\n`
  }
  // const knowledgeDir = join(process.cwd(), "output", "project", "knowledge")
  // try {
  //   const knowledgeFiles = await readdir(knowledgeDir)
  //   for (const fileName of knowledgeFiles) {
  //     const content = await readFile(join(knowledgeDir, fileName), 'utf-8')
  //     baseProjectContext += `## 知识库文件: ${fileName}\n${content}\n\n`
  //     console.error(`读取知识库文件 ${fileName} 成功， 上下文长度: ${baseProjectContext.length}`);
  //   }
  // } catch (e) {
  //     onProgress({ type: 'log', message: `警告: 未找到或无法读取知识库目录: ${knowledgeDir}` })
  // }

  // 创建用于工作模型的上下文
  const workContext = baseProjectContext
  console.error(`工作模型上下文创建完成，长度: ${workContext.length}`);

  // 步骤 7: 外层循环
  for (let loop = 1; loop <= config.testConfig.loopCount; loop++) {
    // 检查是否已取消
    if (isCancelled()) {
      throw new Error('任务已被用户取消');
    }

    const loopDir = join(baseResultDir, loop.toString())
    await mkdir(loopDir, { recursive: true })

    // 创建日志输出文件
    const logPath = join(loopDir, 'log.txt');
    await ensureLogFileExists(logPath);

    // 为工作模型创建一个包含所有背景知识的系统提示词
    const finalSystemPrompt = `
      ${workContext}
    `;
    let qaResults: any[] = [];
    for (const testCase of config.testCases) {
      // 步骤 3: 工作模型回答问题
      let modelAnswer = "N/A (调用失败)";
      let workTokenUsage = 0; // 工作模型token消耗
      let workDurationUsage = 0; // 工作模型耗时
      currentTask++;
      onProgress({ type: 'update', payload: { activeTaskMessage: `正在回答问题 ${testCase.id}...`, progress: (currentTask / totalTasks) * 100, currentTask: currentTask } })

      const workModelConfig = config.models.workParams || {};
      
      const workOptions: LlmGenerationOptions = {
        stream: workModelConfig.streamingEnabled || false, // 使用用户配置的流式设置
        timeoutMs: 90000,
        maxOutputTokens: workModelConfig.maxTokens?.[0] || 8192,
        temperature: workModelConfig.temperature?.[0] || 1.0,
        topP: workModelConfig.topP?.[0] || 1.0,
        presencePenalty: workModelConfig.presencePenalty?.[0] || 0.0,
        frequencyPenalty: workModelConfig.frequencyPenalty?.[0] || 0.0, // 词汇丰富度,默认0，范围-2.0-2.0,值越大，用词越丰富多样；值越低，用词更朴实简单
        systemPrompt: finalSystemPrompt, // 系统提示词
        logPath: logPath,  // 传递日志输出路径
      };
      const workMessages: ChatMessage[] = [
        {
          role: 'user',
          content: testCase.question,
        }
      ];
      // console.log(`工作模型: ${config.models.work}`);

      // 检查是否已取消
      if (isCancelled()) {
        throw new Error('任务已被用户取消');
      }

      // 将当前问题追加到logPath日志文件中
      await appendToLogFile(logPath, `\n=== 问题 #${testCase.id} ===\n${testCase.question}\n\n`);

      const workResult = await safeModelCall(config.models.work, workMessages, workOptions);

      // 累加token使用量
      if (workResult.tokenUsage) {
        totalTokenUsage += workResult.tokenUsage.total_tokens;
        onProgress({ type: 'token_usage', tokenUsage: totalTokenUsage });
        workTokenUsage = workResult.tokenUsage.total_tokens; // 本次问答工作模型消耗token
      }
      if (workResult.durationUsage) { // 本次问答工作模型耗时
        workDurationUsage = Math.round(workResult.durationUsage.total_duration / 1e6);
      }

      if (workResult.success) {
        modelAnswer = workResult.content!;
      } else {
        onProgress({ type: 'log', message: `警告: 回答问题 #${testCase.id} 失败，已跳过评分。` });
      }

      // 将最终运行结果追加到logPath日志文件中
      await appendToLogFile(logPath, `--- 最终答复 ---\n${modelAnswer}\n\n`);

      onProgress({ type: 'state_update', payload: { questionId: testCase.id, questionText: testCase.question, modelAnswer } });

      const resultEntry = {
        id: testCase.id,
        question: testCase.question,
        standardAnswer: testCase.answer,
        modelAnswer,
        workTokenUsage: workTokenUsage,
        workDurationUsage: workDurationUsage,
        error: workResult.error
      };
      qaResults.push(resultEntry);
      await writeFile(join(loopDir, 'results.json'), JSON.stringify(qaResults, null, 2), 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}