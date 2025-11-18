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

/**
 * 加载并缓存所有知识库内容
 */
async function classifyAndCacheKnowledgeContent(onProgress: (data: object) => void) {
  const knowledgeDir = join(process.cwd(), "output", "project", "knowledge");
  onProgress({ type: 'log', message: `开始扫描知识库目录: ${knowledgeDir}` });

  // 定义缓存数组
  const qaPairs: string[] = [];
  const chunks: string[] = [];
  const documents: { name: string, content: string }[] = [];

  try {
    const knowledgeFiles = await readdir(knowledgeDir);
    onProgress({ type: 'log', message: `发现 ${knowledgeFiles.length} 个文件，正在进行智能分类...` });

    // 正则表达式，用于精确识别 Q&A 格式
    const qaRegex = /(^Q:.*\s*\n^A:.*)/gm;

    for (const fileName of knowledgeFiles) {
      const content = await readFile(join(knowledgeDir, fileName), 'utf-8');
      const matches = content.match(qaRegex);

      // 规则: 超过5个Q&A对，则判定为QA文件
      if (matches && matches.length > 5) {
        onProgress({ type: 'log', message: `文件 "${fileName}" 被分类为 [QA类型]` });
        // 按空行分割，并过滤掉无效的空块
        const pairs = content.split(/\n\s*\n/).filter(p => p.trim());
        qaPairs.push(...pairs);
      } else {
        onProgress({ type: 'log', message: `文件 "${fileName}" 被分类为 [文档类型]` });
        // 1. 缓存完整文档内容
        documents.push({ name: fileName, content: content });
        // 2. 缓存按空行分割的文本块
        const contentChunks = content.split(/\n\s*\n/).filter(c => c.trim());
        chunks.push(...contentChunks);
      }
    }
  } catch (e: any) {
    // 如果目录不存在，这是一个严重错误，因为无法进行任何操作
    throw new Error(`无法读取知识库目录: ${knowledgeDir}。请确认文件已上传。错误: ${e.message}`);
  }

  onProgress({ type: 'log', message: `内容缓存完成: QA对(${qaPairs.length}), 文本块(${chunks.length}), 文档(${documents.length})` });

  return { qaPairs, chunks, documents };
}

// 主任务执行器
async function runTask(config: any, baseResultDir: string, onProgress: (data: object) => void, isCancelled: () => boolean = () => false) {
  // 总任务数计算
  const { qaPairs, chunks, documents } = await classifyAndCacheKnowledgeContent(onProgress);
  const { qaCount, chunkCount, documentCount, comprehensiveCount } = config.testConfig;
  const qaTaskTotal = qaPairs.length * qaCount;
  const chunkTaskTotal = chunks.length * chunkCount;
  const documentTaskTotal = documents.length * documentCount;
  const comprehensiveTaskTotal = comprehensiveCount;

  let totalTasks = qaTaskTotal + chunkTaskTotal + documentTaskTotal + comprehensiveTaskTotal;
  if (totalTasks === 0) {
    throw new Error("总任务数为0。请检查知识库文件或在运行界面设置生成数量。");
  }
  onProgress({ type: 'log', message: `任务总数计算完成: ${totalTasks} (QA:${qaTaskTotal}, 切块:${chunkTaskTotal}, 文档:${documentTaskTotal}, 综合:${comprehensiveTaskTotal})` });
  console.log(`任务总数: ${totalTasks} (QA:${qaTaskTotal}, 切块:${chunkTaskTotal}, 文档:${documentTaskTotal}, 综合:${comprehensiveTaskTotal})`);

  let currentTask = 0;
  let totalTokenUsage = 0; // 累计token消耗
  const allResults: any[] = [];

  const executeGenerationTask = async (
    taskType: 'QA' | 'Chunk' | 'Document' | 'Comprehensive',
    systemPrompt: string,
    contentArray: any[], // Can be string[] or {name, content}[]
    userCount: number
  ) => {
    // 如果系统提示词为空，直接跳过此类任务
    if (!systemPrompt.trim()) {
        onProgress({ type: 'log', message: `警告: [${taskType}] 的系统提示词为空，已跳过该类别的所有 ${contentArray.length * userCount} 个任务。` });
        currentTask += contentArray.length * userCount; // 依然要推进任务计数，以保证进度条正确
        // 通知前端更新进度
        onProgress({ type: 'update', payload: {
          activeTaskMessage: `跳过 [${taskType}] 任务 (系统提示词为空)`,
          progress: (currentTask / totalTasks) * 100,
          currentTask: currentTask,
          totalTasks: totalTasks
        } });
        return;
    }
    if (userCount === 0 || contentArray.length === 0) return;
    onProgress({ type: 'log', message: `--- 开始执行 [${taskType}] 任务 ---` });

    for (let loop = 1; loop <= userCount; loop++) {
      if (isCancelled()) return;
      onProgress({ type: 'log', message: `[${taskType}] 第 ${loop}/${userCount} 轮...` });

      const loopDir = join(baseResultDir, loop.toString());
      await mkdir(loopDir, { recursive: true });
      const logPath = join(loopDir, 'log.txt');
      await ensureLogFileExists(logPath);

      for (let i = 0; i < contentArray.length; i++) {
        if (isCancelled()) return;

        currentTask++;
        let sourceIdentifier = `${taskType}-${loop}-${i+1}`;
        // 构造用户指令和上下文
        let userMessage = '';
        switch (taskType) {
          case 'QA':
            userMessage = contentArray[i];
            break;
          case 'Chunk':
            userMessage = contentArray[i];
            break;
          case 'Document':
            sourceIdentifier = contentArray[i].name;
            userMessage = contentArray[i].content;
            break;
          case 'Comprehensive':
            // 综合任务的上下文是所有文档的拼接
            let comprehensiveContext = documents.map(d => `文件名: ${d.name}\n${d.content}`).join('\n\n---\n\n');
            userMessage = comprehensiveContext;
            break;
        }

        const finalUserMessage = userMessage;

        onProgress({ type: 'update', payload: { activeTaskMessage: `[${taskType}] ${i + 1}/${contentArray.length} (第${loop}轮)`, progress: (currentTask / totalTasks) * 100, currentTask: currentTask, totalTasks: totalTasks } });

        const workModelConfig = config.project.workModelParams || {};
        const workOptions: LlmGenerationOptions = {
          stream: workModelConfig.streamingEnabled || false, // 使用用户配置的流式设置
          timeoutMs: 90000,
          maxOutputTokens: workModelConfig.maxTokens?.[0] || 8192,
          temperature: workModelConfig.temperature?.[0] || 1.0,
          topP: workModelConfig.topP?.[0] || 1.0,
          presencePenalty: workModelConfig.presencePenalty?.[0] || 0.0,
          frequencyPenalty: workModelConfig.frequencyPenalty?.[0] || 0.0, // 词汇丰富度,默认0，范围-2.0-2.0,值越大，用词越丰富多样；值越低，用词更朴实简单
          systemPrompt: systemPrompt, // 系统提示词
          logPath: logPath,  // 传递日志输出路径
        };

        const workMessages: ChatMessage[] = [{ role: 'user', content: finalUserMessage }];
        const workResult = await safeModelCall(config.project.workModel, workMessages, workOptions);
        let workDurationUsage = workResult.durationUsage ? Math.round(workResult.durationUsage.total_duration / 1e6) : 0;

        if (workResult.tokenUsage) {
          totalTokenUsage += workResult.tokenUsage.total_tokens;
          onProgress({ type: 'token_usage', tokenUsage: totalTokenUsage });
        }

        let generatedQuestion = "生成失败";
        let generatedAnswer = workResult.error || "N/A";

        if (workResult.success && workResult.content) {
          try {
            const jsonMatch = workResult.content.match(/```json\s*([\s\S]*?)\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : workResult.content;
            const parsed = JSON.parse(jsonString);
            generatedQuestion = parsed.question || "解析失败: 缺少question";
            generatedAnswer = parsed.answer || "解析失败: 缺少answer";
          } catch (e) {
            generatedQuestion = "解析JSON失败";
            generatedAnswer = workResult.content;
          }
        }

        await appendToLogFile(logPath, `--- Model Answer ---\n${generatedAnswer}\n--- Stats ---\nToken Usage: ${workResult.tokenUsage?.total_tokens || 0} | Duration: ${workDurationUsage}ms\n\n`);
        onProgress({ type: 'state_update', payload: { questionId: sourceIdentifier, questionText: generatedQuestion, modelAnswer: generatedAnswer } });

        const resultEntry = {
          id: currentTask,
          taskType,
          question: generatedQuestion,
          answer: generatedAnswer,
          score: 10
        };
        allResults.push(resultEntry);
        await writeFile(join(baseResultDir, 'results.json'), JSON.stringify(allResults, null, 2), 'utf-8');
      }
    }
  }
  await executeGenerationTask('QA', config.project.qaSystemPrompt, qaPairs, qaCount);
  if (isCancelled()) return;
  await executeGenerationTask('Chunk', config.project.chunkSystemPrompt, chunks, chunkCount);
  if (isCancelled()) return;
  await executeGenerationTask('Document', config.project.documentSystemPrompt, documents, documentCount);
  if (isCancelled()) return;
  const comprehensiveDummyContent = Array(comprehensiveCount).fill("N/A");
  await executeGenerationTask('Comprehensive', config.project.comprehensiveSystemPrompt, comprehensiveDummyContent, 1);
}