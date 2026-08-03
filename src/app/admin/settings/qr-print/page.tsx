import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import QrPrintView from './_components/QrPrintView';

/**
 * QR 인쇄용 화면 (A4)
 * URL: /admin/settings/qr-print?url=<방문등록 QR 대상 URL>
 */
export default async function QrPrintPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return <QrPrintView />;
}
