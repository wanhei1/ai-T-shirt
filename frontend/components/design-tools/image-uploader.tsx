"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Upload, X, ImageIcon, Loader2 } from "lucide-react"

interface ImageUploaderProps {
  onImageUploaded: (imageUrl: string) => void
}

interface UploadedImage {
  url: string
  name: string
  size: number
}

export function ImageUploader({ onImageUploaded }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
  }

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        await uploadFile(file)
      }
    }
  }

  const uploadFile = async (file: File) => {
    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append("file", file)

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90))
      }, 100)

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      const data = await response.json()

      if (data.success) {
        const newImage: UploadedImage = {
          url: data.imageUrl,
          name: data.fileName,
          size: data.fileSize,
        }
        setUploadedImages((prev) => [newImage, ...prev])
      } else {
        console.error("Upload failed:", data.error)
      }
    } catch (error) {
      console.error("Upload error:", error)
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Images
          </CardTitle>
          <CardDescription>Add your own images to the design</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isUploading ? (
              <div className="space-y-4">
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Uploading...</p>
                  <Progress value={uploadProgress} className="w-full" />
                  <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium mb-2">Drag & drop images here</p>
                <p className="text-xs text-muted-foreground mb-4">Supports JPG, PNG, GIF, WebP, SVG (max 5MB)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Choose Files
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Uploaded Images */}
      {uploadedImages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uploaded Images</CardTitle>
            <CardDescription>Click to add to your design</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {uploadedImages.map((image, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 cursor-pointer group"
                  onClick={() => onImageUploaded(image.url)}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    <img
                      src={image.url || "/placeholder.svg"}
                      alt={image.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{image.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(image.size)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeImage(index)
                      }}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
