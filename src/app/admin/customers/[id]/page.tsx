import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import CustomerDetail from './_components/CustomerDetail';

/**
 * 고객 상세 페이지
 * URL: /admin/customers/[id]
 */
export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  const { id } = await params;

  return <CustomerDetail customerId={id} />;
}
