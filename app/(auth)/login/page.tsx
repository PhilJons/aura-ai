'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

// Custom Microsoft icon component
const MicrosoftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

export default function WelcomePage() {
  const router = useRouter();
  const [hasSignedInBefore, setHasSignedInBefore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if user has signed in before
    const hasSignedIn = localStorage.getItem('hasSignedInBefore');
    if (hasSignedIn === 'true') {
      setHasSignedInBefore(true);
      // Auto sign-in if they've signed in before
      handleSignIn();
    }
  }, []);

  const handleSignIn = async () => {
    setIsLoading(true);
    // Store that the user has signed in before
    localStorage.setItem('hasSignedInBefore', 'true');
    
    // Sign in with Microsoft
    await signIn('azure-ad', { callbackUrl: '/' });
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.3,
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100
      }
    }
  };

  // If user has signed in before, show a loading screen
  if (hasSignedInBefore) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-background" style={{ fontFamily: 'geist, -apple-system, BlinkMacSystemFont, sans-serif' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center gap-6"
        >
          <Image
            src="/images/Aura_logo.svg"
            alt="Aura AI Logo"
            width={180}
            height={60}
            priority
            className="mb-2"
          />
          <div className="size-8 animate-spin rounded-full border-y-2 border-primary"></div>
          <p className="text-lg text-muted-foreground">Signing you in...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-background" style={{ fontFamily: 'geist, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md overflow-hidden rounded-2xl flex flex-col gap-12 items-center px-6"
      >
        <motion.div variants={itemVariants} className="flex flex-col items-center justify-center gap-2">
          <Image
            src="/images/Aura_logo.svg"
            alt="Aura AI Logo"
            width={220}
            height={80}
            priority
            className="mb-6"
          />
          <motion.h1 
            variants={itemVariants}
            className="text-3xl font-medium tracking-tight text-center"
          >
            Welcome to Aura AI
          </motion.h1>
          <motion.p 
            variants={itemVariants}
            className="text-center text-muted-foreground mt-2 mb-8 max-w-sm"
          >
            Your intelligent assistant for seamless productivity
          </motion.p>
        </motion.div>

        <motion.div variants={itemVariants} className="w-full">
          <Button
            onClick={handleSignIn}
            disabled={isLoading}
            size="lg"
            className="w-full flex items-center justify-center gap-2 py-6 rounded-xl font-normal"
          >
            {isLoading ? (
              <div className="size-5 animate-spin rounded-full border-y-2 border-background"></div>
            ) : (
              <MicrosoftIcon />
            )}
            <span>{isLoading ? 'Signing in...' : 'Sign in with Microsoft'}</span>
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
