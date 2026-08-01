import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import PassportHome from './_components/PassportHome';

/**
 * 전자여권 메인 페이지
 * URL: /passport
 * 로그인되지 않은 경우 /visit 로 리다이렉트
 */
export default async function PassportPage() {
  const session = await getSession();

  if (!session) {
    redirect('/visit');
  }

  return <PassportHome />;
}
