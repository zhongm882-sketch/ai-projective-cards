import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 启用 React 严格模式（帮助发现潜在问题）
  reactStrictMode: true,

  // 编译器优化
  compiler: {
    // 生产环境移除 console.log，但保留 console.error——
    // 原先是整体移除，导致线上出问题时一条日志都看不到。
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },

  // 卡片图片全部是 public/cards/ 下的本地文件，不需要 remotePatterns。
  // 原先这里配的 Replicate / DALL-E / UCloud 域名是给已删除的在线图片生成功能留的。

  // 注意：已移除 experimental.optimizePackageImports
  // 原因：该选项会触发 Turbopack 在 Windows 上的 Bug（读取 nul 设备文件导致崩溃）
};

export default nextConfig;
