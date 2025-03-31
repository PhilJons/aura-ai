'use client'

import { cn } from '@/lib/utils'
import { Globe } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Toggle } from './ui/toggle'
import { useSearchToggle } from '@/components/search-toggle'

// Helper functions for cookie management
function setCookie(name: string, value: string, days = 365) {
  const date = new Date()
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
  const expires = '; expires=' + date.toUTCString()
  document.cookie = name + '=' + value + expires + '; path=/'
}

function getCookie(name: string): string | null {
  const nameEQ = name + '='
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
  }
  return null
}

export function SearchModeToggle() {
  const { isSearchEnabled, setIsSearchEnabled } = useSearchToggle()
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const savedMode = getCookie('search-mode')
    if (savedMode !== null) {
      setIsSearchEnabled(savedMode === 'true')
    }
    setIsLoaded(true)
  }, [setIsSearchEnabled])

  const handleSearchModeChange = (pressed: boolean) => {
    setIsSearchEnabled(pressed)
    setCookie('search-mode', pressed.toString())
  }

  // Don't render anything until we've checked the cookie
  if (!isLoaded) return null

  return (
    <Toggle
      aria-label="Toggle search mode"
      pressed={isSearchEnabled}
      onPressedChange={handleSearchModeChange}
      variant="outline"
      className={cn(
        'gap-1 px-3 border border-input text-muted-foreground bg-background',
        'data-[state=on]:bg-accent-blue',
        'data-[state=on]:text-accent-blue-foreground',
        'data-[state=on]:border-accent-blue-border',
        'hover:bg-accent hover:text-accent-foreground rounded-full'
      )}
    >
      <Globe className="size-4" />
      <span className="text-xs">Search</span>
    </Toggle>
  )
} 