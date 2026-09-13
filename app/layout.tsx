import './globals.css';

export const metadata = {
  title: 'Self-Healing SQL Engine',
  description: 'Natural language to SQL with an autonomous self-healing execution loop.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
