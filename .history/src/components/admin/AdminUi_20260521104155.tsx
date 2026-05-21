export const TableHead = ({ cols }: { cols: string[] }) => (
  <thead>
    <tr>
      {cols.map((col, i) => (
        <th key={i} style={{ textAlign: 'left', padding: '12px 16px', color: '#9ca3af', textTransform: 'uppercase', fontSize: '11px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {col}
        </th>
      ))}
    </tr>
  </thead>
);

export const PlanBadge = ({ plan }: { plan: string }) => (
  <span style={{ padding: '4px 8px', borderRadius: '4px', background: plan === 'PRO' ? 'rgba(124,58,237,0.2)' : 'rgba(107,114,128,0.2)', color: plan === 'PRO' ? '#a78bfa' : '#d1d5db', fontSize: '11px', fontWeight: 'bold' }}>
    {plan}
  </span>
);

export const KpiCard = ({ label, value, sub }: { label: string, value: string, sub: string }) => (
  <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px' }}>
    <div style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', marginBottom: '8px' }}>{label}</div>
    <div style={{ color: '#fff', fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>{value}</div>
    <div style={{ fontSize: '12px', color: '#6b7280' }} dangerouslySetInnerHTML={{ __html: sub }} />
  </div>
);
