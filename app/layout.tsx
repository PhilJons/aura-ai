import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import localFont from 'next/font/local';

import { ThemeProvider } from '@/components/theme-provider';
import { Analytics } from '@/components/analytics';

import './globals.css';

// Define the fonts using next/font
const geistSans = localFont({
  src: '../public/fonts/geist.woff2',
  variable: '--font-geist',
  display: 'swap',
});

const geistMono = localFont({
  src: '../public/fonts/geist-mono.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://chat.vercel.ai'),
  title: 'Aura AI',
  description: 'Your intelligent AI assistant powered by Aura.',
  icons: {
    icon: [
      {
        url: '/images/aura_ai_icon.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/images/aura_ai_icon_white.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: dark)',
      }
    ],
    shortcut: '/images/aura_ai_icon.svg',
  }
};

export const viewport = {
  maximumScale: 1, // Disable auto-zoom on mobile Safari
};

const LIGHT_THEME_COLOR = 'hsl(0 0% 100%)';
const DARK_THEME_COLOR = 'hsl(240deg 10% 3.92%)';
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // `next-themes` injects an extra classname to the body element to avoid
      // visual flicker before hydration. Hence the `suppressHydrationWarning`
      // prop is necessary to avoid the React hydration mismatch warning.
      // https://github.com/pacocoursey/next-themes?tab=readme-ov-file#with-app
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
      </head>
      {/* 
        Add suppressHydrationWarning to the body element to prevent hydration errors 
        from browser extensions like Grammarly that add attributes to the body
      */}
      <body className="antialiased font-sans" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Toaster position="top-center" />
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
