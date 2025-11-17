import { NextResponse } from "next/server"
import { writeFile, mkdir, copyFile, readdir, rm, access, rename } from "fs/promises"
import { join } from "path"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { systemPrompt, knowledgeBaseFiles } = body

    // 创建项目输出目录
    const projectDir = join(process.cwd(), "output", "project")
    const knowledgeDir = join(projectDir, "knowledge")

    try {
      await rm(projectDir, { recursive: true, force: true })
    } catch (error) {
      // 目录不存在，可以继续创建
    }

    // 创建项目目录
    await mkdir(projectDir, { recursive: true })
    await mkdir(knowledgeDir, { recursive: true })

    // 复制知识库文件
    const copiedFiles = []
    const fileDataArray = body.fileData || []
    
    for (const filePath of knowledgeBaseFiles) {
      try {
        // 从请求数据中获取文件对象
        let fileData = fileDataArray.find((f: any) => f.path === filePath)

        // 如果没有精确匹配，尝试只匹配文件名
        if (!fileData) {
          const fileName = filePath.split('/').pop() || filePath
          fileData = fileDataArray.find((f: any) => {
            const dataFileName = f.path.split('/').pop() || f.path
            return dataFileName === fileName || f.name === fileName
          })
        }

        // 确定目标目录
        const targetKnowledgeDir = knowledgeDir

        if (fileData && fileData.content) {
          // 如果有文件内容数据，直接写入文件（新上传的文件）
          const fileName = filePath.split('/').pop() || filePath
          const destPath = join(targetKnowledgeDir, fileName)

          // 处理 data URL 格式 (data:text/plain;base64,...)
          let content = fileData.content
          if (content.startsWith('data:')) {
            // 移除 data URL 前缀，只保留 base64 部分
            const base64Content = content.split(',')[1]
            if (base64Content) {
              content = base64Content
            }
          }

          const buffer = Buffer.from(content, 'base64')
          await writeFile(destPath, buffer)
          copiedFiles.push({
            original: filePath,
            copied: `default/knowledge/${fileName}`
          })
        } else {
          // 如果没有文件内容数据，尝试从现有项目复制
          try {
            const fileName = filePath.split('/').pop() || filePath
            const sourcePath = join(projectDir, "knowledge", fileName)
            const destPath = join(targetKnowledgeDir, fileName)

            // 检查源文件是否存在，如果存在则复制
            await access(sourcePath)
            await copyFile(sourcePath, destPath)
            copiedFiles.push({
              original: filePath,
              copied: `default/knowledge/${fileName}`
            })
            console.log(`Copied existing file: ${filePath}`)
          } catch (copyError) {
            // 如果无法复制现有文件，记录警告
            console.warn(`Warning: Could not copy file ${filePath}. File may not exist in current project.`)
          }
        }
      } catch (error) {
        console.error(`Error processing file ${filePath}:`, error)
      }
    }

    // 生成项目文件内容
    const projectContent = `# 项目配置

## 系统提示词
${systemPrompt}

## 知识库文件
${knowledgeBaseFiles.length > 0 ? knowledgeBaseFiles.map((file: string) => `- ${file}`).join('\n') : '无'}


## 文件生成时间
${new Date().toLocaleString('zh-CN')}
`

    // 写入项目文件
    const projectFilePath = join(projectDir, "project.md")
    await writeFile(projectFilePath, projectContent, 'utf-8')

    return NextResponse.json({
      success: true,
      message: "项目保存成功",
      projectFile: `default/project.md`,
      copiedFiles: copiedFiles
    })

  } catch (error) {
    console.error("Error saving project:", error)
    return NextResponse.json(
      { error: "保存项目时发生错误" },
      { status: 500 }
    )
  }
}