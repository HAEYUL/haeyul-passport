import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import VipManagement from './_components/VipManagement';

/**
 * VIP관리 페이지
 * URL: /admin/vip
 */
export default async function AdminVipPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return <VipManagement />;
}
