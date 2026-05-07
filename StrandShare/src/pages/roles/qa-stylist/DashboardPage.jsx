import React from 'react';
import { ScanLine, Sparkles, PackagePlus, ShieldCheck } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';

const mockStats = [
  { key: 'pending', label: 'Pending QA', value: '12', icon: ScanLine },
  { key: 'approved', label: 'Approved Today', value: '7', icon: ShieldCheck },
  { key: 'rejected', label: 'Rejected Today', value: '2', icon: ScanLine },
  { key: 'styles', label: 'Hairstyles Created', value: '34', icon: Sparkles },
  { key: 'stocks', label: 'Wig Stocks Uploaded', value: '18', icon: PackagePlus },
];

const mockRecentActivity = [
  { code: 'HS-2026-0042', action: 'Approved', detail: 'Bundle 1 - 12in / Black / Virgin', updated: 'Today, 10:14 AM' },
  { code: 'HS-2026-0041', action: 'Rejected', detail: 'Bundle 2 - chemically treated, length below 8in', updated: 'Today, 09:42 AM' },
  { code: 'HS-2026-0040', action: 'Approved', detail: 'Bundle 1 - 14in / Brown / Virgin', updated: 'Yesterday' },
  { code: 'WS-Stock-118', action: 'Uploaded', detail: 'Long wavy black wig - qty 3', updated: 'Yesterday' },
  { code: 'Style-2026-007', action: 'AI Created', detail: 'Bob cut - shoulder length, dark brown', updated: '2 days ago' },
];

export default function DashboardPage() {
  const { theme } = useTheme();
  const primaryColor = theme?.primaryColor || '#0275d8';
  const tertiaryColor = theme?.tertiaryColor || '#10b981';
  const primaryTextColor = theme?.primaryTextColor || '#0f172a';
  const secondaryTextColor = theme?.secondaryTextColor || '#64748b';
  const tertiaryTextColor = theme?.tertiaryTextColor || '#94a3b8';
  const headingFont = theme?.secondaryFontFamily || theme?.fontFamily || 'Poppins';
  const bodyFont = theme?.fontFamily || 'Poppins';

  const rootStyle = { color: primaryTextColor, fontFamily: `${bodyFont}, sans-serif` };
  const headingStyle = { color: primaryTextColor, fontFamily: `${headingFont}, sans-serif` };

  return (
    <div className="space-y-6" style={rootStyle}>
      <div>
        <h1 className="text-3xl font-bold mb-2" style={headingStyle}>Dashboard</h1>
        <p style={{ color: secondaryTextColor }}>
          QA Stylist overview - hair bundle quality checks, AI-generated hairstyle catalog, and wig stock uploads.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {mockStats.map(({ key, label, value, icon: Icon }) => (
          <div key={key} className="rounded-xl border border-gray-200 bg-white p-4">
            <div
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ backgroundColor: `${primaryColor}1a`, color: primaryColor }}
            >
              <Icon size={18} />
            </div>
            <p className="text-sm mt-3" style={{ color: secondaryTextColor }}>{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: primaryTextColor }}>{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold" style={headingStyle}>Recent Activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead style={{ backgroundColor: `${primaryColor}14` }}>
              <tr>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Reference</th>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Action</th>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Detail</th>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {mockRecentActivity.map((row) => (
                <tr key={row.code} className="border-t border-gray-200">
                  <td className="px-4 py-3 font-mono" style={{ color: primaryTextColor }}>{row.code}</td>
                  <td className="px-4 py-3" style={{ color: row.action === 'Rejected' ? '#b91c1c' : tertiaryColor }}>{row.action}</td>
                  <td className="px-4 py-3" style={{ color: secondaryTextColor }}>{row.detail}</td>
                  <td className="px-4 py-3" style={{ color: tertiaryTextColor }}>{row.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
