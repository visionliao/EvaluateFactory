"use client"

import { Label } from "@/components/ui/label"

export function UserManual() {
  return (
    <div className="p-4 md:p-8 max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto">
      <div className="mb-6 border-b border-border pb-4 md:mb-8">
        <h1 className="text-xl font-semibold text-foreground md:text-2xl">使用手册</h1>
      </div>

      <div className="space-y-8">
        {/* Introduction */}
        <section className="space-y-4">
          <div>
            <Label className="text-base font-medium text-foreground">简介</Label>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              欢迎使用 Evaluate Factory！本工具致力于将您从繁琐的测试用例构建工作中解放出来。它能基于您的本地知识库（如文本文档、Q&A集），自动化、多维度地生成高质量的测试题集，为您的 RAG (检索增强生成) 系统提供持续、可靠的评估基准，助力知识库的校准与迭代。
            </p>
          </div>
        </section>

        {/* Quick Start */}
        <section className="space-y-4 pt-6 border-t border-border">
          <div>
            <Label className="text-base font-medium text-foreground">快速开始</Label>
            <div className="mt-4 space-y-3">
              <div className="p-4 bg-muted/20 rounded-lg border border-border">
                <h3 className="text-sm font-medium text-foreground mb-2">1. 创建项目</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  在“项目配置”页面中，配置并持久化您的测试环境。这确保了每次生成题集都在一个一致且可复现的基准上进行。
                  <div className="pl-4 mt-1">
                    <strong>系统提示词：</strong> 模拟生产环境中，您为大模型设定的核心指令和背景。
                  </div>
                  <div className="pl-4 mt-1">
                    <strong>知识库：</strong> 上传与生产环境一致的知识库文件，这是生成高质量、高相关性问题的基础。
                  </div>
                  <div className="pl-4 mt-1">
                    <strong>大模型配置：</strong> 选择用于生成测试题集的工作模型，并精细调整其参数（如温度、最大Token等），以控制生成风格。
                  </div>
                </p>
              </div>
              <div className="p-4 bg-muted/20 rounded-lg border border-border">
                <h3 className="text-sm font-medium text-foreground mb-2">2. 开始运行</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  在“开始运行”页面，选择您需要的生成策略并启动自动化流程。您可以实时监控生成进度和细节。
                  <div className="pl-4 mt-1">
                    <strong>Q&A题集：</strong> 针对Q&A格式的文档，智能生成语义相似的等价问题，用于测试模型的泛化能力。
                  </div>
                  <div className="pl-4 mt-1">
                    <strong>切块问题集：</strong> 将普通文档按段落切分，为每个独立的知识片段生成精准的核心问题，测试模型对细节知识的掌握。
                  </div>
                  <div className="pl-4 mt-1">
                    <strong>文档问题集：</strong> 从整篇文档的全局视角出发，生成概括性、总结性的问题，测试模型的宏观理解能力。
                  </div>
                  <div className="pl-4 mt-1">
                    <strong>综合问题集：</strong> 跨越多篇文档，生成需要结合不同来源信息才能回答的复杂问题，考验模型的综合分析与推理能力。
                  </div>
                </p>
              </div>
              <div className="p-4 bg-muted/20 rounded-lg border border-border">
                <h3 className="text-sm font-medium text-foreground mb-2">3. 管理与使用题集</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  在“测试题集”页面，您可以对所有生成的历史题集进行统一管理，并将其无缝对接到 FTA (Factory Test Agent) 自动化测试流程中，形成“生成-测试-评估”的完整闭环。
                  <div className="pl-4 mt-1">
                    <strong>生命周期管理：</strong> 方便地对问题进行增、删、改、查操作，并通过Tag标签进行分类，让题集管理井井有条。
                  </div>
                  <div className="pl-4 mt-1">
                    <strong>数据持久化与溯源：</strong> 所有题集都以JSON格式持久化保存（位于 `output/result/` 目录下），并清晰标注了每个问题的来源文件，便于追溯和分析。
                  </div>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features (Optimized) */}
        <section className="space-y-4 pt-6 border-t border-border">
          <div>
            <Label className="text-base font-medium text-foreground">核心优势</Label>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-sm text-foreground">•</span>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">自动化与规模化生成：</strong> 将您从手工编写测试用例的繁琐工作中解放出来，能够快速、低成本地生成数百上千个高质量、多样化的测试问题，实现全面的测试覆盖。
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-sm text-foreground">•</span>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">多维度问题生成策略：</strong> 内置四种递进式的问题生成策略（Q&A、切块、文档、综合），从细节到宏观，从单一知识到跨文档推理，深度挖掘知识库的每一个角落，确保测试的全面性。
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-sm text-foreground">•</span>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">基于项目的管理与持久化：</strong> 以“项目”为核心，将环境配置（提示词、知识库、模型）与生成的题集绑定，确保了测试的可追溯性、一致性与可复用性，让您的评估工作更加科学严谨。
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-sm text-foreground">•</span>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">全方位的题集生命周期管理：</strong> 提供从生成、编辑、标记到持久化存储的全套管理功能，将测试题集沉淀为团队的核心资产，为AI应用的持续迭代和回归测试提供坚实的数据基础。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Tips (Optimized) */}
        <section className="space-y-4 pt-6 border-t border-border">
          <div>
            <Label className="text-base font-medium text-foreground">专家技巧</Label>
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-foreground leading-relaxed">
                  💡 <strong>模拟真实世界：测试的黄金法则</strong><br />
                  测试结果的价值，源于其对真实环境的模拟程度。请务必确保“项目配置”中的所有设置（特别是系统提示词和知识库文件）与您最终生产环境中的配置严格保持一致。
                </p>
              </div>
               <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-sm text-foreground leading-relaxed">
                  💡 <strong>提示词是你的方向盘：精调以获得高质量问题</strong><br />
                  生成问题的质量直接取决于您在“项目配置”中为不同策略（QA、切块、文档、综合）设定的系统提示词。尝试在提示词中更明确地定义您想要的问题类型、风格或考察角度，以获得更理想的生成结果。
                </p>
              </div>
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-sm text-foreground leading-relaxed">
                  💡 <strong>效率就是力量：掌握批量编辑</strong><br />
                  当题集规模增长，或需要进行批量修改、协作时，直接在IDE中编辑 `output/result/[时间戳]/results.json` 文件是最高效的方式。利用代码编辑器的查找替换、多光标等功能，能极大提升您的管理效率。
                </p>
              </div>
              <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <p className="text-sm text-foreground leading-relaxed">
                  💡 <strong>组合策略，实现全面覆盖</strong><br />
                  不要只依赖一种问题类型。一个健康的测试集应该同时包含多种策略生成的问题：使用“切块问题”确保细节覆盖度，使用“文档问题”检查宏观理解，再用“综合问题”测试模型的推理能力。
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}