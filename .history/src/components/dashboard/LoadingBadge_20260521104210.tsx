export const LoadingBadge = ({ text, variant }: { text: string, variant?: string }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderRadius: '16px', background: 'rgba(255,255,255,0.1)' }}>
        <span className="animate-pulse">◌</span>
        {text}
    </span>
);
