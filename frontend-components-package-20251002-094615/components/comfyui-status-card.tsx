"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react"

interface ComfyUIStatus {
  status: string
  comfyUIAvailable: boolean
  serverAddress: string
  message: string
  error?: string
}

export function ComfyUIStatusCard() {
  const [status, setStatus] = useState<ComfyUIStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const checkStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/generate-image', {
        method: 'GET'
      })
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      setStatus({
        status: "error",
        comfyUIAvailable: false,
        serverAddress: "unknown",
        message: "无法连接到服务器",
        error: error instanceof Error ? error.message : "未知错误"
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : status?.comfyUIAvailable ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500" />
          )}
          ComfyUI 状态
        </CardTitle>
        <CardDescription>
          检查 ComfyUI 服务器连接状态
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">连接状态:</span>
              <Badge 
                variant={status.comfyUIAvailable ? "default" : "destructive"}
              >
                {status.comfyUIAvailable ? "已连接" : "未连接"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">服务器地址:</span>
              <span className="text-sm text-muted-foreground">
                {status.serverAddress}
              </span>
            </div>
            
            <div className="text-sm">
              <span className="font-medium">状态信息:</span>
              <p className="text-muted-foreground mt-1">
                {status.message}
              </p>
              {status.error && (
                <p className="text-red-600 mt-1 text-xs">
                  错误: {status.error}
                </p>
              )}
            </div>

            {!status.comfyUIAvailable && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  <strong>如何启动 ComfyUI:</strong>
                </p>
                <ol className="text-xs text-yellow-700 mt-2 space-y-1">
                  <li>1. 下载并安装 ComfyUI</li>
                  <li>2. 在 ComfyUI 目录运行: <code>python main.py</code></li>
                  <li>3. 确保服务运行在 127.0.0.1:8188</li>
                  <li>4. 刷新此页面检查连接</li>
                </ol>
              </div>
            )}
          </>
        )}

        <Button 
          onClick={checkStatus} 
          disabled={loading}
          className="w-full"
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          刷新状态
        </Button>
      </CardContent>
    </Card>
  )
}