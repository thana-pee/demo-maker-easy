import React from 'react';
import Link from 'next/link';
import { BarChart3, CreditCard } from 'lucide-react';

interface AdminNavTabsProps {
  activeTab: 'analytics' | 'topup';
}

export const AdminNavTabs: React.FC<AdminNavTabsProps> = ({ activeTab }) => {
  return (
    <div className="flex items-center gap-2 p-1 bg-surface-1 border border-hairline rounded-2xl shadow-e1 w-fit">
      <Link
        href="/admin/analytics"
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
          activeTab === 'analytics'
            ? 'bg-accent-500 text-white shadow-e1'
            : 'text-ink-600 hover:text-ink-900 hover:bg-surface-2'
        }`}
      >
        <BarChart3 className="w-4 h-4" />
        <span>สถิติการใช้งาน</span>
      </Link>
      <Link
        href="/admin/topup"
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
          activeTab === 'topup'
            ? 'bg-accent-500 text-white shadow-e1'
            : 'text-ink-600 hover:text-ink-900 hover:bg-surface-2'
        }`}
      >
        <CreditCard className="w-4 h-4" />
        <span>จัดการเครดิต & Top Spenders</span>
      </Link>
    </div>
  );
};
