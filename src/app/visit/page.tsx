import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getCurrentStoreName } from '@/app/actions';
import VisitLanding from './_components/VisitLanding';

/**
 * QR 접속 랜딩 페이지
 * URL: /visit?key=매장별 QR 토큰 (매장마다 QR이 따로 발급됩니다)
 * key 확인은 proxy.ts에서 처리합니다 (쿠키 설정은 Server Component에서 할 수 없어서 분리).
 * 이미 로그인된 경우 전자여권으로 리다이렉트
 */
export default async function VisitPage() {
  const session = await getSession();

  if (session) {
    redirect('/passport');
  }

  const storeName = await getCurrentStoreName();

  return <VisitLanding storeName={storeName} />;
}
