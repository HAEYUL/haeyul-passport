import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import WelcomeScreen from './_components/WelcomeScreen';

/**
 * 가입 완료(첫 방문) 안내 페이지
 * URL: /welcome
 * registerCustomer 직후에만 이동하는 화면입니다.
 * /visit과 분리된 별도 라우트라, 가입 직후 세션이 설정되면서
 * 발생하는 리다이렉트 새로고침에 성공 화면이 덮이지 않습니다.
 */
export default async function WelcomePage() {
  const session = await getSession();

  if (!session) {
    redirect('/visit');
  }

  return <WelcomeScreen />;
}
