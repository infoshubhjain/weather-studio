import './globals.css';

export const metadata = {
  title: 'Weather Studio — Shubh Jain',
  description: 'Full-stack weather app: live forecasts, saved weather records with full CRUD, multi-format export, and location discovery. Built for the PM Accelerator AI Engineer Intern assessment.',
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
