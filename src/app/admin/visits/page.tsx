import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import VisitManagement from './_components/VisitManagement';

/**
 * 방문관리 페이지
 * URL: /admin/visits
 */
export default async function AdminVisitsPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return <VisitManagement />;
}
