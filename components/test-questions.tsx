"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle } from "lucide-react"
import { Pencil, Trash2, X, Check, Loader2 } from "lucide-react"

interface Question {
  id: number
  question: string
  answer: string
  score: number
  tag?: string
  source?: string
}

export function TestQuestions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  // 新增时间戳相关状态
  const [timestamps, setTimestamps] = useState<string[]>([])
  const [selectedTimestamp, setSelectedTimestamp] = useState<string>("")
  const [useResultsFile, setUseResultsFile] = useState(false)

  // 标签层级相关状态
  const [tagLevels, setTagLevels] = useState<string[][]>([])
  const [maxLevel, setMaxLevel] = useState(0)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editQuestion, setEditQuestion] = useState("")
  const [editAnswer, setEditAnswer] = useState("")
  const [editScore, setEditScore] = useState(10)

  // 编辑模式下的标签选择状态
  const [editTagValues, setEditTagValues] = useState<string[]>([])

  const [isAdding, setIsAdding] = useState(false)
  const [newQuestion, setNewQuestion] = useState("")
  const [newAnswer, setNewAnswer] = useState("")
  const [newScore, setNewScore] = useState(10)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null)

  // 新增模式下的标签选择状态
  const [newTagValues, setNewTagValues] = useState<string[]>([])

  // 解析标签为数组
  const parseTagToArray = (tag: string): string[] => {
    return tag ? tag.split('-') : []
  }

  // 从标签数组构建标签字符串
  const buildTagFromString = (tagArray: string[]): string => {
    return tagArray.filter(part => part).join('-')
  }

  // 修改编辑函数，支持results文件编辑
  const handleSaveEdit = async (id: number) => {
    setSaving(true)
    try {
      const newTag = buildTagFromString(editTagValues)
      const response = await fetch('/api/test-cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'edit',
          id,
          question: editQuestion,
          answer: editAnswer,
          score: editScore,
          tag: newTag,
          timestamp: selectedTimestamp // 传递当前选择的时间戳
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setQuestions(data.data)
        setEditingId(null)
        setEditQuestion("")
        setEditAnswer("")
        setEditScore(10)
        setEditTagValues([])
      } else {
        alert('保存失败')
      }
    } catch (error) {
      console.error('Error saving edit:', error)
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (showDeleteConfirm === null) return

    setSaving(true)
    try {
      const response = await fetch('/api/test-cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
          id: showDeleteConfirm,
          timestamp: selectedTimestamp // 传递当前选择的时间戳
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setQuestions(data.data)
        setShowDeleteConfirm(null)
      } else {
        alert('删除失败')
      }
    } catch (error) {
      console.error('Error deleting:', error)
      alert('删除失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAddQuestion = async () => {
    if (newQuestion.trim() && newAnswer.trim()) {
      setSaving(true)
      try {
        const newTag = buildTagFromString(newTagValues)
        const response = await fetch('/api/test-cases', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'add',
            question: newQuestion,
            answer: newAnswer,
            score: newScore,
            tag: newTag,
            source: '用户自定义',
            timestamp: selectedTimestamp // 传递当前选择的时间戳
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setQuestions(data.data)
          setNewQuestion("")
          setNewAnswer("")
          setNewScore(10)
          setNewTagValues([])
          setIsAdding(false)
        } else {
          alert('添加失败')
        }
      } catch (error) {
        console.error('Error adding question:', error)
        alert('添加失败')
      } finally {
        setSaving(false)
      }
    }
  }

  // 加载标签层级信息
  useEffect(() => {
    const loadTags = async () => {
      try {
        const response = await fetch("/api/test-cases?tags=true")
        if (response.ok) {
          const data = await response.json()
          setTagLevels(data.levels || [])
          setMaxLevel(data.maxLevel || 0)
        }
      } catch (error) {
        console.error("Failed to load tags:", error)
      }
    }

    loadTags()
  }, [])

  // 加载时间戳列表
  useEffect(() => {
    const loadTimestamps = async () => {
      try {
        const response = await fetch("/api/test-cases")
        if (response.ok) {
          const data = await response.json()
          // 检查返回的是否是时间戳数组（而不是原有的test_cases格式）
          if (Array.isArray(data)) {
            setTimestamps(data)
          } else {
            // 如果返回的是原有的test_cases格式，说明没有时间戳
            setTimestamps([])
            setQuestions(data.checks)
          }
        }
      } catch (error) {
        console.error("Failed to load timestamps:", error)
      }
    }

    loadTimestamps()
  }, [])

  // 当选择时间戳时，加载对应的结果
  useEffect(() => {
    const loadResults = async () => {
      if (selectedTimestamp) {
        try {
          const response = await fetch(`/api/test-cases?timestamp=${selectedTimestamp}`)
          if (response.ok) {
            const data = await response.json()
            setQuestions(data)
            setUseResultsFile(true)
          }
        } catch (error) {
          console.error("Failed to load results:", error)
        }
      } else if (timestamps.length > 0) {
        // 如果没有选择时间戳但有时间戳列表，加载最新的结果
        const latestTimestamp = timestamps[0]
        try {
          const response = await fetch(`/api/test-cases?timestamp=${latestTimestamp}`)
          if (response.ok) {
            const data = await response.json()
            setQuestions(data)
            setUseResultsFile(true)
            setSelectedTimestamp(latestTimestamp) // 自动设置为最新时间戳
          }
        } catch (error) {
          console.error("Failed to load latest results:", error)
        }
      }
      setLoading(false)
    }

    if (timestamps.length >= 0) {
      loadResults()
    }
  }, [selectedTimestamp, timestamps])

  const handleEdit = (question: Question) => {
    setEditingId(question.id)
    setEditQuestion(question.question)
    setEditAnswer(question.answer)
    setEditScore(question.score)

    // 初始化标签值
    const tagArray = parseTagToArray(question.tag || "")
    const paddedTagArray = [...tagArray]
    while (paddedTagArray.length < maxLevel) {
      paddedTagArray.push("")
    }
    setEditTagValues(paddedTagArray)

    // 延迟调整高度，确保 DOM 更新后执行
    setTimeout(() => {
      const editQuestionElement = document.querySelector(`textarea[placeholder="请输入问题..."]`) as HTMLTextAreaElement
      const editAnswerElement = document.querySelector(`textarea[placeholder="请输入标准答案..."]`) as HTMLTextAreaElement

      if (editQuestionElement) {
        editQuestionElement.style.height = "auto"
        editQuestionElement.style.height = editQuestionElement.scrollHeight + "px"
      }
      if (editAnswerElement) {
        editAnswerElement.style.height = "auto"
        editAnswerElement.style.height = editAnswerElement.scrollHeight + "px"
      }
    }, 0)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditQuestion("")
    setEditAnswer("")
    setEditScore(10)
    setEditTagValues([])
  }

  const handleDelete = async (id: number) => {
    setShowDeleteConfirm(id)
  }

  const cancelDelete = () => {
    setShowDeleteConfirm(null)
  }

  const handleCancelAdd = () => {
    setNewQuestion("")
    setNewAnswer("")
    setNewScore(10)
    setNewTagValues([])
    setIsAdding(false)
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto">
        <div className="mb-6 border-b border-border pb-4 md:mb-8">
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">测试题集</h1>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">加载测试题...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto">
      <div className="mb-6 border-b border-border pb-4 md:mb-8">
        <h1 className="text-xl font-semibold text-foreground md:text-2xl">测试题集</h1>
      </div>

      {/* 时间戳选择器 */}
      {timestamps.length > 0 && (
        <div className="mb-6 space-y-2">
          <Label className="text-sm font-medium text-foreground">选择运行结果</Label>
          <Select value={selectedTimestamp} onValueChange={setSelectedTimestamp}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="选择一个时间戳查看结果" />
            </SelectTrigger>
            <SelectContent>
              {timestamps.map((timestamp) => (
                <SelectItem key={timestamp} value={timestamp}>
                  {timestamp} {timestamp === timestamps[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            您可以自由编辑、删除或添加问题，所有操作都会保存到当前选择的results.json文件中
          </p>
        </div>
      )}

      {timestamps.length === 0 && !loading && (
        <div className="mb-6 p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
          <p className="text-sm text-yellow-800">
            没有找到运行结果文件。请先在"运行结果"页面执行任务生成测试题集。
          </p>
        </div>
      )}

      <div className="space-y-4">
        {questions.map((question) => (
          <div key={question.id} className="border border-border rounded-lg p-4 space-y-3 bg-background">
            {editingId === question.id ? (
              <>
                <div className="space-y-2">
                  <textarea
                    ref={(el) => {
                      if (el) {
                        el.style.height = "auto"
                        el.style.height = el.scrollHeight + "px"
                      }
                    }}
                    value={editQuestion}
                    onChange={(e) => {
                      setEditQuestion(e.target.value)
                      e.target.style.height = "auto"
                      e.target.style.height = e.target.scrollHeight + "px"
                    }}
                    placeholder="请输入问题..."
                    className="w-full px-0 py-2 text-sm bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none resize-none transition-colors overflow-hidden"
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement
                      target.style.height = "auto"
                      target.style.height = target.scrollHeight + "px"
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <textarea
                    ref={(el) => {
                      if (el) {
                        el.style.height = "auto"
                        el.style.height = el.scrollHeight + "px"
                      }
                    }}
                    value={editAnswer}
                    onChange={(e) => {
                      setEditAnswer(e.target.value)
                      e.target.style.height = "auto"
                      e.target.style.height = e.target.scrollHeight + "px"
                    }}
                    placeholder="请输入标准答案..."
                    className="w-full px-0 py-2 text-sm bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none resize-none transition-colors overflow-hidden"
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement
                      target.style.height = "auto"
                      target.style.height = target.scrollHeight + "px"
                    }}
                  />
                </div>

                {/* 标签层级选择器 */}
                {maxLevel > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: maxLevel }).map((_, levelIndex) => (
                      <Select
                        key={levelIndex}
                        value={editTagValues[levelIndex] || ""}
                        onValueChange={(value) => {
                          const newValues = [...editTagValues]
                          newValues[levelIndex] = value
                          setEditTagValues(newValues)
                        }}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue placeholder={`层级${levelIndex + 1}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {(tagLevels[levelIndex] || []).map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ))}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSaveEdit(question.id)}
                    disabled={saving}
                    className="bg-foreground text-background hover:bg-foreground/90"
                  >
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                    确定
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* 显示额外的字段信息（如果存在） */}
                {(question.tag || question.source) && (
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground border-b border-border pb-2">
                    {question.tag && (
                      <span className="px-2 py-1 bg-muted rounded">
                        类型: {question.tag}
                      </span>
                    )}
                    {question.source && (
                      <span className="px-2 py-1 bg-muted rounded">
                        来源: {question.source}
                      </span>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-sm text-foreground">{question.question}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{question.answer}</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(question)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(question.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    删除
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}

        {isAdding && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-background">
            <div className="space-y-2">
              <textarea
                value={newQuestion}
                onChange={(e) => {
                  setNewQuestion(e.target.value)
                  e.target.style.height = "auto"
                  e.target.style.height = e.target.scrollHeight + "px"
                }}
                placeholder="请输入问题..."
                className="w-full px-0 py-2 text-sm bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none resize-none transition-colors overflow-hidden"
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = "auto"
                  target.style.height = target.scrollHeight + "px"
                }}
              />
            </div>
            <div className="space-y-2">
              <textarea
                value={newAnswer}
                onChange={(e) => {
                  setNewAnswer(e.target.value)
                  e.target.style.height = "auto"
                  e.target.style.height = e.target.scrollHeight + "px"
                }}
                placeholder="请输入标准答案..."
                className="w-full px-0 py-2 text-sm bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none resize-none transition-colors overflow-hidden"
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = "auto"
                  target.style.height = target.scrollHeight + "px"
                }}
              />
            </div>

            {/* 标签层级选择器 */}
            {maxLevel > 0 && (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: maxLevel }).map((_, levelIndex) => (
                  <Select
                    key={levelIndex}
                    value={newTagValues[levelIndex] || ""}
                    onValueChange={(value) => {
                      const newValues = [...newTagValues]
                      newValues[levelIndex] = value
                      setNewTagValues(newValues)
                    }}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue placeholder={`层级${levelIndex + 1}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {(tagLevels[levelIndex] || []).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelAdd}
                disabled={saving}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleAddQuestion}
                disabled={saving}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                确定
              </Button>
            </div>
          </div>
        )}

        {!isAdding && (
          <div className="flex justify-end pt-2">
            <Button onClick={() => {
              setIsAdding(true)
              // 初始化新增模式下的标签值，默认选择每层级的第一个选项
              const defaultTagValues = tagLevels.map(level => level.length > 0 ? level[0] : "")
              setNewTagValues(defaultTagValues)
            }} variant="outline" className="border-border hover:bg-secondary">
              新增问题
            </Button>
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteConfirm !== null} onOpenChange={cancelDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              确认删除
            </DialogTitle>
            <DialogDescription>
              确定要删除这个问题吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDelete}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                "删除"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}