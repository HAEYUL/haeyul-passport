import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import RewardsList from './_components/RewardsList';

/**
 * 내 선물함 페이지
 * URL: /passport/rewards
 * 로그인되지 않은 경우 /visit 로 리다이렉트
 */
export default async function RewardsPage() {
  const session = await getSession();

  if (!session) {
    redirect('/visit');
  }

  return <RewardsList />;
}
