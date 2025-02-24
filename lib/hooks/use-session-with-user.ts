'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * A custom hook that extends useSession with additional user loading state
 * and handles redirection for unauthenticated users
 */
export function useSessionWithUser({ required = true, redirectTo = '/api/auth/signin' } = {}) {
  const router = useRouter();
  const { data: session, status, update } = useSession({
    required,
    onUnauthenticated() {
      if (required) {
        router.push(redirectTo);
      }
    }
  });
  
  const [isUserLoaded, setIsUserLoaded] = useState(false);

  // Track when user data is fully loaded (session + user ID)
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      setIsUserLoaded(true);
    } else {
      setIsUserLoaded(false);
    }
  }, [status, session]);

  // Refresh session if needed
  useEffect(() => {
    if (status === 'authenticated' && !session?.user?.id) {
      // If we have a session but no user ID, try refreshing the session
      update();
    }
  }, [status, session, update]);

  return { 
    session,
    status,
    isUserLoaded,
    userId: session?.user?.id,
    isLoading: status === 'loading' || (status === 'authenticated' && !isUserLoaded),
    isAuthenticated: status === 'authenticated' && isUserLoaded,
    update
  };
} 