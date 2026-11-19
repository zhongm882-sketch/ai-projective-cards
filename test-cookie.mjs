import { NextRequest } from 'next/server';

// 测试脚本：检查 Next.js Request 是否能正确读取 cookie
async function testCookieAccess() {
  // 模拟一个带 cookie 的请求
  const mockRequest = new NextRequest('http://localhost:3001/test', {
    headers: {
      'cookie': 'pc_access=test_token; pc_refresh=test_refresh'
    }
  });

  console.log('=== Cookie Test ===');
  console.log('Cookie header:', mockRequest.headers.get('cookie'));
  console.log('Cookies object:', mockRequest.cookies);
  console.log('Get pc_access:', mockRequest.cookies.get('pc_access'));
}

testCookieAccess().catch(console.error);
