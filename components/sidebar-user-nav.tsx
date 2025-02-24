'use client';
import { ChevronUp } from 'lucide-react';
import type { User } from 'next-auth';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    async function fetchProfilePhoto() {
      if (session?.accessToken) {
        try {
          const response = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
            headers: {
              Authorization: `Bearer ${session.accessToken}`
            }
          });

          if (response.ok) {
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            setProfileImage(imageUrl);
          }
        } catch (error) {
          console.error('Error fetching profile photo:', error);
        }
      }
    }

    fetchProfilePhoto();
  }, [session?.accessToken]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent bg-background data-[state=open]:text-sidebar-accent-foreground h-10">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt={user.name ?? 'User Avatar'}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs font-medium">
                    {user.name?.charAt(0) ?? user.email?.charAt(0)}
                  </span>
                </div>
              )}
              <span className="truncate">{user.name ?? user.email}</span>
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
