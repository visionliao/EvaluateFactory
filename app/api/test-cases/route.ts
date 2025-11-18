import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const TEST_CASES_PATH = path.join(process.cwd(), 'template', 'questions', 'test_cases.json')
const RESULT_DIR = path.join(process.cwd(), 'output', 'result')
const TAGS_PATH = path.join(process.cwd(), 'output', 'project', 'tags.json')

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const timestamp = searchParams.get('timestamp')
    const tags = searchParams.get('tags')

    if (tags === 'true') {
      // 返回tags.json内容
      try {
        const data = await fs.readFile(TAGS_PATH, 'utf-8')
        const tagsData = JSON.parse(data)

        // 处理标签层级，获取每层级的所有可能选项
        const levelMap = new Map<number, Set<string>>()

        tagsData.forEach((tag: string) => {
          const parts = tag.split('-')
          parts.forEach((part, index) => {
            if (!levelMap.has(index)) {
              levelMap.set(index, new Set())
            }
            levelMap.get(index)!.add(part)
          })
        })

        // 转换为数组格式
        const levels = Array.from(levelMap.entries())
          .sort(([a], [b]) => a - b) // 按层级索引排序
          .map(([_, options]) => Array.from(options))

        return NextResponse.json({
          levels,
          maxLevel: levels.length,
          tags: tagsData
        })
      } catch (error) {
        console.error('Error reading tags:', error)
        return NextResponse.json({ levels: [], maxLevel: 0, tags: [] })
      }
    } else if (timestamp) {
      // 返回指定时间戳的results.json内容
      const resultsPath = path.join(RESULT_DIR, timestamp, 'results.json')
      try {
        const data = await fs.readFile(resultsPath, 'utf-8')
        const results = JSON.parse(data)
        return NextResponse.json(results)
      } catch (error) {
        console.error(`Error reading results for timestamp ${timestamp}:`, error)
        return NextResponse.json({ error: '无法找到指定时间戳的结果文件' }, { status: 404 })
      }
    } else {
      // 返回时间戳列表
      try {
        const entries = await fs.readdir(RESULT_DIR, { withFileTypes: true })
        const timestamps = entries
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name)
          .sort()
          .reverse() // 最新的在前面

        return NextResponse.json(timestamps)
      } catch (error) {
        console.error('Error reading result directory:', error)
        // 如果无法读取result目录，返回空数组而不是错误
        return NextResponse.json([])
      }
    }
  } catch (error) {
    console.error('Error in GET:', error)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { action, id, question, answer, score, timestamp, tag, source } = data

    let filePath: string
    let isResultFile = false

    if (timestamp) {
      // 操作results.json文件
      filePath = path.join(RESULT_DIR, timestamp, 'results.json')
      isResultFile = true
    } else {
      // 操作原有的test_cases.json文件
      filePath = TEST_CASES_PATH
    }

    // 读取现有数据
    const fileData = await fs.readFile(filePath, 'utf-8')
    let questionsData

    if (isResultFile) {
      // results.json是数组格式
      questionsData = JSON.parse(fileData)
    } else {
      // test_cases.json是对象格式，包含checks数组
      const testCases = JSON.parse(fileData)
      questionsData = testCases.checks
    }

    let newQuestion

    switch (action) {
      case 'add':
        newQuestion = {
          id: Math.max(...questionsData.map((c: any) => c.id), 0) + 1,
          ...(tag && { tag }),
          ...(source && { source }),
          question,
          answer,
          score: score || 10
        }
        questionsData.push(newQuestion)
        break

      case 'edit':
        questionsData = questionsData.map((q: any) => {
          if (q.id === id) {
            const updatedQuestion = { ...q }
            // Update all fields
            updatedQuestion.question = question
            updatedQuestion.answer = answer
            updatedQuestion.score = score || 10
            if (tag) updatedQuestion.tag = tag
            // Reorder fields to match desired structure
            return {
              id: updatedQuestion.id,
              ...(updatedQuestion.tag && { tag: updatedQuestion.tag }),
              ...(updatedQuestion.source && { source: updatedQuestion.source }),
              question: updatedQuestion.question,
              answer: updatedQuestion.answer,
              score: updatedQuestion.score
            }
          }
          return q
        })
        break

      case 'delete':
        questionsData = questionsData.filter((q: any) => q.id !== id)
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // 写入文件
    let dataToWrite
    if (isResultFile) {
      dataToWrite = questionsData
    } else {
      dataToWrite = { checks: questionsData }
    }

    await fs.writeFile(filePath, JSON.stringify(dataToWrite, null, 2), 'utf-8')

    // 返回更新后的数据
    if (isResultFile) {
      return NextResponse.json({ success: true, data: questionsData })
    } else {
      return NextResponse.json({ success: true, data: { checks: questionsData } })
    }
  } catch (error) {
    console.error('Error updating questions:', error)
    return NextResponse.json({ error: 'Failed to update questions' }, { status: 500 })
  }
}