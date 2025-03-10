'use client';

import { useDarkMode } from '@/logic/clientHooks';
import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isDarkMode = useDarkMode();
  if (typeof isDarkMode === 'undefined') return (<html><body></body></html>);

  const modeName = isDarkMode ? 'dark' : 'light';
  return (
    <html lang="en">
      <body data-bs-theme={modeName}>{children}</body>
    </html>
  )
}
