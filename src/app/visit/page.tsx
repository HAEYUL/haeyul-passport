import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import VisitLanding from './_components/VisitLanding';

/**
 * QR 접속 랜딩 페이지
 * URL: /visit (매장 전체에서 동일한 QR 하나를 사용합니다)
 * 이미 로그인된 경우 전자여권으로 리다이렉트
 */
export default async function VisitPage() {
  // 이미 로그인된 경우 전자여권으로 이동
  const session = await getSession();
  if (session) {
    redirect('/passport');
  }

  return <VisitLanding />;
}
