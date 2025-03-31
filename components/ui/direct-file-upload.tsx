"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { logger } from "@/lib/utils/logger"

export type UploadResult = {
  success: boolean
  attachments?: any[]
  error?: string
}

export type DirectFileUploadProps = {
  onUploadStart?: () => void
  onUploadComplete?: (result: UploadResult) => void
  onUploadError?: (error: string) => void
  chatId: string
  maxSizeMB?: number
  allowedTypes?: string[]
  debug?: boolean // Enable additional debug toasts
}

export function useDirectFileUpload({
  onUploadStart,
  onUploadComplete,
  onUploadError,
  chatId,
  maxSizeMB = 50, // Default to 50MB max size
  allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  debug = false
}: DirectFileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({})

  const debugLog = useCallback((message: string, data?: any) => {
    if (debug) {
      console.log(`[DEBUG] ${message}`, data)
      // Removed toast.info for debugging messages
    }
    // Always log to the logger
    logger.upload.debug(message, data)
  }, [debug])

  const validateFile = useCallback(
    (file: File): boolean => {
      debugLog('Validating file', {
        filename: file.name,
        fileSize: file.size,
        fileType: file.type,
        maxSizeMB,
        allowedTypes
      })

      // Check file size
      const maxSizeBytes = maxSizeMB * 1024 * 1024
      if (file.size > maxSizeBytes) {
        const errorMsg = `File size exceeds ${maxSizeMB}MB limit (${(file.size / (1024 * 1024)).toFixed(2)}MB)`
        logger.upload.info('File validation failed: size limit exceeded', {
          filename: file.name,
          fileSize: file.size,
          maxSize: maxSizeBytes,
          sizeMB: (file.size / (1024 * 1024)).toFixed(2)
        })
        toast.error(errorMsg)
        onUploadError?.(errorMsg)
        return false
      }

      // Check file type
      if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
        const errorMsg = `File type ${file.type} not allowed. Allowed types: ${allowedTypes.join(', ')}`
        logger.upload.info('File validation failed: file type not allowed', {
          filename: file.name,
          fileType: file.type,
          allowedTypes
        })
        toast.error(errorMsg)
        onUploadError?.(errorMsg)
        return false
      }

      debugLog('File validation successful', {
        filename: file.name
      })
      return true
    },
    [maxSizeMB, allowedTypes, onUploadError, debugLog]
  )

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResult> => {
      if (!validateFile(file)) {
        return {
          success: false,
          error: "File validation failed"
        }
      }

      try {
        setIsUploading(true)
        setUploadProgress({...uploadProgress, [file.name]: 0})
        onUploadStart?.()
        
        debugLog('Starting upload process', {
          filename: file.name,
          fileSize: file.size,
          fileType: file.type
        })
        
        // Step 1: Get a SAS token for direct upload
        debugLog('Step 1: Requesting SAS token', {
          filename: file.name
        })
        
        logger.upload.info('Requesting SAS token', {
          filename: file.name,
          contentType: file.type,
          fileSize: file.size
        })
        
        const sasStartTime = Date.now()
        const sasResponse = await fetch('/api/files/sas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
          }),
        })
        const sasEndTime = Date.now()
        
        debugLog(`SAS token request completed in ${sasEndTime - sasStartTime}ms`, {
          status: sasResponse.status,
          statusText: sasResponse.statusText
        })

        if (!sasResponse.ok) {
          const errorData = await sasResponse.json().catch(() => ({}))
          const errorMsg = `Failed to get SAS token: ${errorData.error || sasResponse.statusText}`
          
          logger.upload.error('Failed to get SAS token', {
            status: sasResponse.status,
            statusText: sasResponse.statusText,
            error: errorData.error || 'Unknown error',
            filename: file.name,
          })
          
          toast.error(errorMsg)
          onUploadError?.(errorMsg)
          
          return {
            success: false,
            error: errorMsg
          }
        }

        const sasData = await sasResponse.json()
        const { sasUrl, blobName, containerName, blobUrl } = sasData
        
        debugLog('SAS token received successfully', {
          blobName,
          containerName
        })
        
        setUploadProgress({...uploadProgress, [file.name]: 10})

        // Step 2: Upload directly to Azure Blob Storage using the SAS URL
        debugLog('Step 2: Starting direct upload to Azure', {
          blobName
        })
        
        logger.upload.info('Starting direct upload to Azure', {
          filename: file.name,
          contentType: file.type,
          blobName,
        })
        
        // Removed toast.info for upload start
        
        const uploadStartTime = Date.now()
        
        // Create a progress tracker
        const lastProgressUpdate = Date.now()
        const progressUpdateInterval = 500 // ms
        
        try {
          const uploadResponse = await fetch(sasUrl, {
            method: 'PUT',
            headers: {
              'x-ms-blob-type': 'BlockBlob',
              'Content-Type': file.type,
            },
            body: file,
          })
          
          const uploadEndTime = Date.now()
          const uploadDuration = uploadEndTime - uploadStartTime
          const uploadSpeed = (file.size / 1024 / 1024) / (uploadDuration / 1000)
          
          debugLog(`Direct upload completed in ${uploadDuration}ms (${uploadSpeed.toFixed(2)}MB/s)`, {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText
          })

          if (!uploadResponse.ok) {
            const errorMsg = `Direct upload failed: ${uploadResponse.statusText} (${uploadResponse.status})`
            
            logger.upload.error('Direct upload to Azure failed', {
              status: uploadResponse.status,
              statusText: uploadResponse.statusText,
              filename: file.name,
              blobName,
              uploadDuration
            })
            
            toast.error(errorMsg)
            onUploadError?.(errorMsg)
            
            return {
              success: false,
              error: errorMsg
            }
          }
          
          setUploadProgress({...uploadProgress, [file.name]: 50})
          
          logger.upload.info('Direct upload to Azure successful', {
            filename: file.name,
            blobName,
            uploadDuration,
            uploadSpeed: `${uploadSpeed.toFixed(2)}MB/s`
          })
          
          debugLog('Direct upload successful', {
            uploadDuration,
            uploadSpeed: `${uploadSpeed.toFixed(2)}MB/s`
          })
        } catch (uploadError) {
          const errorMsg = uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
          
          logger.upload.error('Direct upload to Azure failed with exception', {
            error: errorMsg,
            errorName: uploadError instanceof Error ? uploadError.name : 'Unknown',
            errorStack: uploadError instanceof Error ? uploadError.stack : 'No stack trace',
            filename: file.name,
            blobName
          })
          
          toast.error(`Upload failed: ${errorMsg}`)
          onUploadError?.(errorMsg)
          
          return {
            success: false,
            error: errorMsg
          }
        }
        
        // Removed toast.info for processing notification
        
        // Step 3: Process the uploaded file
        debugLog('Step 3: Processing the uploaded file', {
          blobName
        })
        
        const processStartTime = Date.now()
        const processResponse = await fetch('/api/files/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            blobName,
            contentType: file.type,
            originalFilename: file.name,
            chatId: chatId,
          }),
        })
        const processEndTime = Date.now()
        const processDuration = processEndTime - processStartTime
        
        debugLog(`Processing completed in ${processDuration}ms`, {
          status: processResponse.status,
          statusText: processResponse.statusText
        })

        if (!processResponse.ok) {
          const errorData = await processResponse.json().catch(() => ({}))
          const errorMsg = `File processing failed: ${errorData.error || processResponse.statusText}`
          
          logger.upload.error('File processing failed', {
            status: processResponse.status,
            statusText: processResponse.statusText,
            error: errorData.error || 'Unknown error',
            filename: file.name,
            blobName,
            processDuration
          })
          
          toast.error(errorMsg)
          onUploadError?.(errorMsg)
          
          return {
            success: false,
            error: errorMsg
          }
        }

        const attachments = await processResponse.json()
        setUploadProgress({...uploadProgress, [file.name]: 100})
        
        // Calculate total duration
        const totalDuration = processEndTime - sasStartTime
        
        logger.upload.info('File upload and processing complete', {
          filename: file.name,
          attachmentCount: attachments.length,
          totalDuration,
          fileSize: file.size,
          processingTime: processDuration
        })
        
        debugLog('Upload and processing complete', {
          totalDuration: `${(totalDuration / 1000).toFixed(2)}s`,
          attachmentCount: attachments.length
        })
        
        // Removed success toast notification
        
        const result = {
          success: true,
          attachments,
        }
        
        onUploadComplete?.(result)
        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        
        logger.upload.error('File upload failed', {
          error: errorMsg,
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorStack: error instanceof Error ? error.stack : 'No stack trace',
          filename: file.name,
        })
        
        toast.error(`Upload failed: ${errorMsg}`)
        onUploadError?.(errorMsg)
        
        return {
          success: false,
          error: errorMsg,
        }
      } finally {
        setIsUploading(false)
        // Remove this file from progress tracking
        const newProgress = {...uploadProgress}
        delete newProgress[file.name]
        setUploadProgress(newProgress)
      }
    },
    [chatId, onUploadComplete, onUploadError, onUploadStart, validateFile, uploadProgress, debugLog]
  )

  return {
    uploadFile,
    isUploading,
    uploadProgress
  }
} 