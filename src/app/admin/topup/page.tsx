import type { Metadata } from 'next';
import { AdminTopupClient } from '@/components/AdminTopupClient';

export const metadata: Metadata = {
  title: 'Admin Top-Up & Credit Management — Demo Maker Easy',
  description: 'ระบบจัดการเติมเครดิตแบบแมนนวลและดูอันดับผู้เติมเงินสูงสุด (Top Spenders) สำหรับผู้ดูแลระบบ',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminTopupPage() {
  return <AdminTopupClient />;
}
