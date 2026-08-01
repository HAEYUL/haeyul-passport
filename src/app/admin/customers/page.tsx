import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import CustomerList from './_components/CustomerList';

/**
 * 고객 목록/검색 페이지
 * URL: /admin/customers
 */
export default async function AdminCustomersPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return <CustomerList />;
}
