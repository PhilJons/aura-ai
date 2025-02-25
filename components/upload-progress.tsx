"use client";

import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface UploadProgressProps {
  uploadProgress: Record<string, number>;
  className?: string;
}

export function UploadProgress({ uploadProgress, className }: UploadProgressProps) {
  // Store the highest progress value for each file to ensure smooth animation
  const progressRefsMap = useRef<Record<string, number>>({});
  // Store animation intervals for cleanup
  const animationIntervalsRef = useRef<Record<string, NodeJS.Timeout>>({});
  // Store simulated progress values using state for re-rendering
  const [simulatedProgress, setSimulatedProgress] = useState<Record<string, number>>({});
  // Store files that have reached simulated 100% but are still waiting for backend
  const [simulatedComplete, setSimulatedComplete] = useState<Record<string, boolean>>({});
  // Store start times for each file upload
  const startTimesRef = useRef<Record<string, number>>({});
  // Total animation duration in milliseconds (15 seconds)
  const ANIMATION_DURATION = 15000;
  
  // Initialize simulated progress immediately when a new file is added
  useEffect(() => {
    const newSimulatedProgress = { ...simulatedProgress };
    let hasChanges = false;
    
    // Initialize any new files with 1% progress to ensure they start moving immediately
    Object.keys(uploadProgress).forEach(filename => {
      if (simulatedProgress[filename] === undefined) {
        console.log(`Initializing progress for ${filename}`);
        newSimulatedProgress[filename] = 1; // Start at 1% instead of 0%
        startTimesRef.current[filename] = Date.now();
        hasChanges = true;
      }
    });
    
    // Update state only if there are changes
    if (hasChanges) {
      console.log("Setting initial simulated progress", newSimulatedProgress);
      setSimulatedProgress(newSimulatedProgress);
    }
  }, [uploadProgress]);
  
  // Set up animation intervals for each file
  useEffect(() => {
    console.log("Current uploadProgress:", uploadProgress);
    console.log("Current simulatedProgress:", simulatedProgress);
    
    // Create intervals for files that don't have one yet
    Object.entries(uploadProgress).forEach(([filename, actualProgress]) => {
      // Reset simulated complete if actual progress is complete
      if (actualProgress >= 100 && simulatedComplete[filename]) {
        setSimulatedComplete(prev => ({
          ...prev,
          [filename]: false
        }));
      }
      
      // Only create intervals for files that are in progress (not complete)
      if (actualProgress < 100) {
        // Clear existing interval if any
        if (animationIntervalsRef.current[filename]) {
          clearInterval(animationIntervalsRef.current[filename]);
        }
        
        // Create new interval
        console.log(`Setting up animation interval for ${filename}`);
        animationIntervalsRef.current[filename] = setInterval(() => {
          const now = Date.now();
          const startTime = startTimesRef.current[filename] || now; // Fallback if startTime is missing
          const elapsedTime = now - startTime;
          
          // Calculate progress based on elapsed time (0-99%)
          let timerProgress = Math.min(99, (elapsedTime / ANIMATION_DURATION) * 100);
          
          // Apply easing function to make progress feel more natural
          // Slower at start, faster in middle, slower at end
          timerProgress = easeInOutCubic(timerProgress / 100) * 100;
          
          // If actual progress is ahead of timer progress, accelerate timer
          // This ensures we speed up if the backend is faster than expected
          const actualValue = uploadProgress[filename] || 0;
          if (actualValue > timerProgress) {
            // Boost timer progress to be slightly ahead of actual progress
            timerProgress = actualValue + 5;
          }
          
          // Force minimum progress of 1% to ensure movement
          timerProgress = Math.max(1, timerProgress);
          
          console.log(`${filename}: Timer progress = ${timerProgress.toFixed(1)}%, Actual = ${actualValue}%`);
          
          setSimulatedProgress(prev => {
            // Ensure progress never goes backwards
            const currentValue = prev[filename] || 0;
            const newValue = Math.max(currentValue, timerProgress);
            
            // If we've reached 99% in simulation but backend isn't done yet,
            // mark as simulated complete
            if (newValue >= 99 && actualValue < 100 && !simulatedComplete[filename]) {
              setSimulatedComplete(prevComplete => ({
                ...prevComplete,
                [filename]: true
              }));
            }
            
            return {
              ...prev,
              [filename]: newValue
            };
          });
        }, 50); // Update every 50ms for very smooth animation
      }
      
      // Clear interval if upload is complete
      if (actualProgress >= 100 && animationIntervalsRef.current[filename]) {
        console.log(`Upload complete for ${filename}, clearing interval`);
        clearInterval(animationIntervalsRef.current[filename]);
        delete animationIntervalsRef.current[filename];
        
        // Set simulated progress to 100 when complete
        setSimulatedProgress(prev => ({
          ...prev,
          [filename]: 100
        }));
      }
    });
    
    // Cleanup function
    return () => {
      Object.values(animationIntervalsRef.current).forEach(interval => {
        clearInterval(interval);
      });
    };
  }, [uploadProgress, simulatedComplete]);
  
  // Easing function for smoother progress animation
  function easeInOutCubic(x: number): number {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
  
  if (Object.keys(uploadProgress).length === 0) return null;
  
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <AnimatePresence>
        {Object.entries(uploadProgress).map(([filename, actualProgress]) => {
          // Use the simulated progress for display
          let displayProgress = simulatedProgress[filename] || 1; // Default to 1% if not set
          
          // When backend is processing (100%), show 100%
          const isProcessing = actualProgress >= 100;
          
          // For animation smoothness, ensure progress never goes backwards
          if (!progressRefsMap.current[filename] || displayProgress > progressRefsMap.current[filename]) {
            progressRefsMap.current[filename] = displayProgress;
          } else {
            displayProgress = progressRefsMap.current[filename];
          }
          
          // Check if we've reached simulated 100% but are still waiting for backend
          const showProcessing = isProcessing || simulatedComplete[filename];
          
          return (
            <FileUploadProgressItem 
              key={`uploading-${filename}`}
              filename={filename}
              displayProgress={displayProgress}
              isProcessing={showProcessing}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

interface FileUploadProgressItemProps {
  filename: string;
  displayProgress: number;
  isProcessing: boolean;
  className?: string;
}

function FileUploadProgressItem({ 
  filename, 
  displayProgress, 
  isProcessing,
  className 
}: FileUploadProgressItemProps) {
  // Ensure displayProgress is never 0 for visual feedback
  const safeDisplayProgress = Math.max(1, displayProgress);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "bg-background border border-zinc-200 dark:border-zinc-800 py-2 px-3 rounded-xl w-fit flex flex-row gap-3 items-center",
        className
      )}
    >
      {/* Document icon area with circular progress */}
      <div className="relative flex items-center justify-center w-6 h-6">
        <svg className="w-6 h-6" viewBox="0 0 24 24">
          <circle 
            cx="12" 
            cy="12" 
            r="10" 
            fill="none" 
            className="stroke-zinc-200 dark:stroke-zinc-800" 
            strokeWidth="1.5"
          />
          <motion.circle 
            cx="12" 
            cy="12" 
            r="10" 
            fill="none" 
            className="stroke-blue-500 dark:stroke-blue-400" 
            strokeWidth="1.5"
            strokeLinecap="round"
            transform="rotate(-90 12 12)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: isProcessing ? 1 : safeDisplayProgress / 100 }}
            transition={{ 
              duration: 0.3, 
              ease: "easeInOut",
              type: "spring",
              stiffness: 60
            }}
          />
        </svg>
        
        {/* Center dot or processing indicator */}
        <div className="absolute inset-0 flex items-center justify-center">
          {isProcessing ? (
            <motion.div 
              className="w-1.5 h-1.5 bg-blue-500 dark:bg-blue-400 rounded-full"
              animate={{ 
                scale: [1, 1.5, 1],
                opacity: [1, 0.7, 1]
              }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity,
                ease: "easeInOut" 
              }}
            />
          ) : (
            <div className="w-1.5 h-1.5 bg-blue-500 dark:bg-blue-400 rounded-full" />
          )}
        </div>
      </div>
      
      {/* Text content */}
      <div className="flex flex-col items-start gap-1">
        <div className="text-sm font-medium">{filename.length > 25 ? filename.substring(0, 23) + '...' : filename}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {isProcessing ? (
            <>
              <span>Processing</span>
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                ...
              </motion.span>
            </>
          ) : (
            <>
              <span>Uploading</span>
              <motion.span
                key={Math.round(safeDisplayProgress)}
                initial={{ y: 5 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {Math.round(safeDisplayProgress)}%
              </motion.span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
} 