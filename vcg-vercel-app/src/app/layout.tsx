import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VCG – Virtual Communication Gateway',
  description: 'IEEE 2030.5 · FIWARE · IDS Dataspace — MI6228 Group 13',
  themeColor: '#00b9f1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
