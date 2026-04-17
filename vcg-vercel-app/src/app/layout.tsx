import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'VCG Portal — Virtual Communication Gateway',
  description: 'IEEE 2030.5 Energy Community Dashboard — MI6228 Group 13',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VCG Portal',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#0a0c10',
  },
}

export const viewport: Viewport = {
  themeColor: '#e63946',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VCG Portal" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{__html: `
          if('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js')
                .then(r => console.log('SW registered:', r.scope))
                .catch(e => console.log('SW failed:', e))
            })
          }
        `}} />
      </body>
    </html>
  )
}
