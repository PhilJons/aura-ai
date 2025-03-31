'use client';
import { ChevronUp } from 'lucide-react';
import type { User } from 'next-auth';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import Image from 'next/image';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function SidebarUserNav({ user }: { user: User }) {
  const { setTheme, theme } = useTheme();
  const { data: session } = useSession();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(user.name || user.email || null);
  const [isLoadingImage, setIsLoadingImage] = useState(true);

  useEffect(() => {
    async function fetchProfilePhoto() {
      if (!session?.accessToken) {
        setIsLoadingImage(false);
        return;
      }
      
      setIsLoadingImage(true);
      
      try {
        // Try the direct photo endpoint first
        const photoResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: {
            Authorization: `Bearer ${session.accessToken}`
          }
        });

        if (photoResponse.ok) {
          const blob = await photoResponse.blob();
          const imageUrl = URL.createObjectURL(blob);
          setProfileImage(imageUrl);
          setIsLoadingImage(false);
          return;
        }
        
        // If direct photo fails, try the beta endpoint
        const betaPhotoResponse = await fetch('https://graph.microsoft.com/beta/me/photo/$value', {
          headers: {
            Authorization: `Bearer ${session.accessToken}`
          }
        });
        
        if (betaPhotoResponse.ok) {
          const blob = await betaPhotoResponse.blob();
          const imageUrl = URL.createObjectURL(blob);
          setProfileImage(imageUrl);
          setIsLoadingImage(false);
          return;
        }
        
        // If both fail, try to use the user.image from the session if available
        if (user.image) {
          setProfileImage(user.image);
        }
        
      } catch (error) {
        console.error('Error fetching profile photo:', error);
      } finally {
        setIsLoadingImage(false);
      }
    }

    async function fetchUserProfile() {
      if (!session?.accessToken) return;
      
      try {
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: {
            Authorization: `Bearer ${session.accessToken}`
          }
        });

        if (response.ok) {
          const profile = await response.json();
          if (profile.displayName) {
            setUserName(profile.displayName);
          }
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    }

    fetchProfilePhoto();
    fetchUserProfile();
    
    // Cleanup function to revoke object URLs to avoid memory leaks
    return () => {
      if (profileImage && profileImage.startsWith('blob:')) {
        URL.revokeObjectURL(profileImage);
      }
    };
  }, [session?.accessToken, user, user.image, profileImage]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent bg-background data-[state=open]:text-sidebar-accent-foreground h-10">
              {!isLoadingImage && profileImage ? (
                <Image
                  src={profileImage}
                  alt={userName ?? 'User Avatar'}
                  width={24}
                  height={24}
                  className="rounded-full"
                  onError={() => setProfileImage(null)}
                />
              ) : (
                <div className="size-6 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs font-medium">
                    {userName?.charAt(0) ?? user.email?.charAt(0)}
                  </span>
                </div>
              )}
              <span className="truncate">{userName ?? user.email}</span>
              <ChevronUp className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            className="w-[--radix-popper-anchor-width]"
          >
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {`Toggle ${theme === 'light' ? 'dark' : 'light'} mode`}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <button
                type="button"
                className="w-full cursor-pointer"
                onClick={() => {
                  signOut({
                    redirectTo: '/',
                  });
                }}
              >
                Sign out
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
