import { Space_Grotesk, Inter_Tight } from 'next/font/google';
import './globals.css';

// Self-hosted at build time by next/font — no CDN request, no layout shift.
// Space Grotesk carries the numerals (it has excellent tabular figures, which
// this app leans on hard); Inter Tight handles running text.
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const body = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata = {
  title: 'Weather Studio — Shubh Jain',
  description:
    'A live weather instrument: real-time conditions rendered as a procedural sky, a 5-day forecast, an activity-scored best-day picker, a saved Location Wallet, and a full CRUD weather archive. Built for the PM Accelerator AI Engineer Intern assessment.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070a13',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
