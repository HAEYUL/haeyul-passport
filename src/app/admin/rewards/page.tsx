import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import RewardStats from './_components/RewardStats';

/**
 * 선물 발급/사용 집계 페이지
 * URL: /admin/rewards
 */
export default async function AdminRewardsPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return <RewardStats />;
}
