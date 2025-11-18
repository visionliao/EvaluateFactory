// lib/llm/vercel-ai-provider.ts
import { 
  streamText, 
  generateText, 
  LanguageModel,
  stepCountIs,
  jsonSchema,
  wrapLanguageModel,
  extractReasoningMiddleware
} from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ChatMessage, TokenUsage, DurationUsage, StreamingResult, LlmProviderResponse, BaseProviderConfig } from './types';
import { appendToLogFile } from '@/lib/server-utils';

/**
 * 统一的 LLM 提供商，使用 Vercel AI SDK 处理所有模型
 */
export class VercelAIProvider {
  private providerName: string;
  private apiKey: string;
  private proxyUrl?: string;
  private logPath?: string;

  constructor(providerName: string, apiKey: string, proxyUrl?: string) {
    this.providerName = providerName;
    this.apiKey = apiKey;
    this.proxyUrl = proxyUrl;
  }

  /**
   * 根据 provider 和 config 创建 Vercel AI SDK 的模型实例
   */
  private createModelInstance(modelName: string): LanguageModel {
    const providerKey = this.providerName.toLowerCase();

    switch (providerKey) {
      // google gemini
      case 'google':
        return createGoogleGenerativeAI({ apiKey: this.apiKey })(modelName);

      // anthropic
      case 'anthropic':
        const anthropicProvider = createAnthropic({
          apiKey: this.apiKey,
          baseURL: this.proxyUrl, // 可选,用于代理
        });
        return anthropicProvider(modelName);

      // ollama本地模型
      case 'ollama':
        // 使用OpenAI兼容模式访问Ollama
        // 确保使用正确的Ollama OpenAI兼容端点
        const ollamaBaseURL = (this.proxyUrl || 'http://127.0.0.1:11434') + '/v1';
        console.log(`[VercelAIProvider] Creating Ollama model with baseURL: ${ollamaBaseURL}`);
        const openaiProvider = createOpenAI({
          baseURL: ollamaBaseURL,
          apiKey: this.apiKey || 'ollama' // Ollama不需要真实API key
        });
        const baseModel = openaiProvider.chat(modelName);
        // 使用中间件包装模型以提取推理内容
        return wrapLanguageModel({
          model: baseModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' })
        });

      // OpenAI
      case 'openai':
        return createOpenAI({ baseURL: this.proxyUrl, apiKey: this.apiKey })(modelName);

      // 所有兼容 OpenAI 的其他国产模型 (包括 deepseek, moonshot, zhipu, qwen 等)
      default:
        const otherModelProvider = createOpenAI({
          baseURL: this.proxyUrl,
          apiKey: this.apiKey,
        });
        return otherModelProvider.chat(modelName);
    }
  }

  
  /**
   * 将我们自定义的 ChatMessage[] 格式映射到 Vercel AI SDK 需要的消息格式
   */
  private mapMessagesToSdkFormat(messages: ChatMessage[]): any[] {
    return messages.map(msg => {
      return { role: msg.role, content: msg.content };
    });
  }

  /**
   * 将 Vercel SDK 的结果适配回我们自己的 LlmProviderResponse 格式
   */
  private async adaptVercelResponse(result: any, totalDuration: number): Promise<LlmProviderResponse> {
    const usage: TokenUsage = {
      prompt_tokens: (result.totalUsage as any)?.inputTokens || 0,
      completion_tokens: (result.totalUsage as any)?.outputTokens || 0,
      reasoning_tokens: (result.totalUsage as any)?.reasoningTokens || 0,
      cachedInput_tokens: (result.totalUsage as any)?.cachedInputTokens || 0,
      total_tokens: (result.totalUsage as any)?.totalTokens || 0,
    };

    const duration: DurationUsage = {
      total_duration: totalDuration,
      load_duration: 0,
      prompt_eval_duration: 0,
      eval_duration: 0,
    };

    
    // 推理内容会在 result.reasoning 中
    if (result.reasoning) {
      console.log('[大模型思考内容]:', result.reasoning);
      if (this.logPath && result.reasoning.length > 10) {
        const sendMessages = JSON.stringify(result.reasoning, null, 2);
        await appendToLogFile(this.logPath, `--- 思考过程 ---\n${sendMessages}\n\n`);
      }
    }

    return {
      content: result.text || null, // text 现在不包含 <think> 标签
            usage: usage,
      duration: duration
    };
  }

  /**
   * @description 将通用配置转换为Vercel AI SDK所需的参数格式
   * @param messages 聊天消息
   * @param options 包含所有配置的 BaseProviderConfig 对象
   * @returns 准备好用于 streamText/generateText 的参数对象
   */
  private prepareSdkParams(messages: ChatMessage[], options: BaseProviderConfig): any {
    // 组装最终的参数对象
    const sdkParams: any = {
      system: options.systemPrompt,
      messages: this.mapMessagesToSdkFormat(messages),
      temperature: options.temperature,
      topP: options.topP,
      presencePenalty: options.presencePenalty,
      frequencyPenalty: options.frequencyPenalty,
      maxTokens: options.maxOutputTokens,
    };
    this.logPath = options.logPath;

    return sdkParams;
  }

  /**
   * 非流式生成
   */
  async generateNonStreaming(
    model: string,
    messages: ChatMessage[],
    options: BaseProviderConfig
  ): Promise<LlmProviderResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    // 记录总开始时间
    const totalStartTime = Date.now();
    try {
      const languageModel = this.createModelInstance(model);

      const generateOptions = this.prepareSdkParams(messages, options);
      console.log('\n--- [LLM Request Log - Non-Streaming] ---');
      console.log(`Timestamp: ${new Date().toISOString()}`);
      console.log('调用大模型：', model)
            console.log('系统提示词：', generateOptions.system || '无')
      console.log('发送给大模型的消息：', generateOptions.messages)
      if (this.logPath) {
        const sendMessages = JSON.stringify(generateOptions.messages, null, 2);
        await appendToLogFile(this.logPath, `--- 发送给大模型的消息 ---\n${sendMessages}\n\n`);
      }
      // console.log('参数配置信息:', JSON.stringify(generateOptions, null, 2));
      console.log('-----------------------------------------\n');

      const result = await generateText({
        model: languageModel,
        ...generateOptions,
        signal: controller.signal, // 超时控制
      });

      
      const totalDuration = (Date.now() - totalStartTime) * 1e6;
      console.log(`\n总耗时: ${totalDuration}ns`);

      const adaptedResult = await this.adaptVercelResponse(result, totalDuration);
      console.log('大模型回复:', adaptedResult.content || '无');
      return adaptedResult;
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * 流式生成
   */
  async generateStreaming(
    model: string,
    messages: ChatMessage[],
    options: BaseProviderConfig
  ): Promise<StreamingResult | LlmProviderResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const languageModel = this.createModelInstance(model);

      const streamOptions = this.prepareSdkParams(messages, options);
      console.log('\n--- [LLM Request Log - Streaming] ---');
      console.log(`Timestamp: ${new Date().toISOString()}`);
      console.log('调用大模型：', model)
            console.log('系统提示词：', streamOptions.system || '无')
      console.log('发送给大模型的消息：', streamOptions.messages)
      if (this.logPath) {
        const sendMessages = JSON.stringify(streamOptions.messages, null, 2);
        const messageForLog = sendMessages.length > 200
                ? sendMessages.slice(0, 300) + '...'
                : sendMessages;
        await appendToLogFile(this.logPath, `--- 发送给大模型的消息 ---\n${messageForLog}\n\n`);
      }
      // console.log('参数配置信息:', JSON.stringify(streamOptions, null, 2));
      console.log('-----------------------------------------\n');

      const result = await streamText({
        model: languageModel,
        ...streamOptions,
        signal: controller.signal, // 超时控制
      });

      // 设置token统计Promise
      let finalUsageResolver: (usage: TokenUsage | undefined) => void;
      const finalUsagePromise = new Promise<TokenUsage | undefined>(resolve => {
        finalUsageResolver = resolve;
        result.totalUsage.then(usage => resolve({
          prompt_tokens: (usage as any)?.inputTokens || 0,
          completion_tokens: (usage as any)?.outputTokens || 0,
          reasoning_tokens: (usage as any)?.reasoningTokens || 0,
          cachedInput_tokens: (usage as any)?.cachedInputTokens || 0,
          total_tokens: (usage as any)?.totalTokens || 0,
        })).catch(() => resolve(undefined));
      });

      // 创建可读流来处理Vercel AI SDK的流式响应
      const readableStream = new ReadableStream<string>({
        async start(controller) {
          try {
            // 使用Vercel AI SDK的toDataStream方法
            const text = await result.text;
            if (text) {
              console.log('大模型流式回复:', text);
              controller.enqueue(text);
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        }
      });

      return {
        stream: readableStream,
        finalUsagePromise: finalUsagePromise,
        finalDurationPromise: Promise.resolve(undefined), // Vercel SDK 不提供
      };
    } catch(error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}