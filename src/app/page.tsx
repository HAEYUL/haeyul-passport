import { redirect } from 'next/navigation';

/**
 * 루트 접속 시 QR 접속 화면으로 이동합니다.
 * (로그인된 경우 /visit에서 다시 /passport로 이동합니다)
 */
export default function Home() {
  redirect('/visit');
}
