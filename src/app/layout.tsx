import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 投射卡 · 认识自己',
  description: '每一次联想，都是认识自己的开始。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
