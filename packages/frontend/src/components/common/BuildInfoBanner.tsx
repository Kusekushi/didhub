import React from 'react';
import { Box, Typography, Link } from '@mui/material';
import { fetchBuildInfo, BuildInfo } from '../../services/buildInfoService';

export default function BuildInfoBanner(): React.ReactElement | null {
  const [info, setInfo] = React.useState<BuildInfo | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const b = await fetchBuildInfo();
      if (mounted) setInfo(b);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!info) return null;

  return (
    <Box sx={{ mt: 4, p: 1, borderTop: 1, borderColor: 'divider', color: 'text.secondary' }}>
      <Typography variant="caption">
        Server: {info.server_version} · Frontend: {info.frontend_version} · Target: {info.target} · Commit:{' '}
        <Link href={`https://github.com/Kusekushi/didhub/commit/${info.git_commit}`} target="_blank" rel="noopener noreferrer">
          {info.git_commit}
        </Link>{' '}
        · Built: {new Date(info.build_time).toLocaleString()}
      </Typography>
    </Box>
  );
}
