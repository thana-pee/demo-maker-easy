import type { Metadata } from 'next';
import { AnalyticsDashboardClient } from '@/components/AnalyticsDashboardClient';

export const metadata: Metadata = {
  title: 'Admin Product Analytics — Demo Maker Easy',
  description: 'แดชบอร์ดสรุปสถิติการใช้งานฟังก์ชันและสไตล์นักแต่งเพลงยอดนิยมสำหรับเจ้าของระบบ',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminAnalyticsPage() {
  return <AnalyticsDashboardClient />;
}
