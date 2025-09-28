import React, { useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface LicenseInfo {
  [key: string]: {
    licenses: string;
    repository?: string;
    publisher?: string;
    path?: string;
    licenseFile?: string;
  };
}

interface BackendLicense {
  name: string;
  version: string;
  license: string;
  repository?: string;
  description?: string;
}

/**
 * Licenses page component that displays third-party license information
 * for both frontend and backend dependencies.
 */
export default function Licenses() {
  const [frontendLicenses, setFrontendLicenses] = useState<LicenseInfo | null>(null);
  const [backendLicenses, setBackendLicenses] = useState<BackendLicense[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLicenses = async () => {
      try {
        const [frontendRes, backendRes] = await Promise.all([
          fetch('/licenses-frontend.json'),
          fetch('/licenses-backend.json'),
        ]);

        if (!frontendRes.ok || !backendRes.ok) {
          throw new Error('Failed to fetch license information');
        }

        const frontendData = await frontendRes.json();
        const backendData = await backendRes.json();

        setFrontendLicenses(frontendData);
        setBackendLicenses(backendData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchLicenses();
  }, []);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">
          Failed to load license information: {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Third-Party Licenses
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        This page displays the licenses of all third-party dependencies used by DIDHub.
      </Typography>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Frontend Dependencies</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {frontendLicenses && Object.entries(frontendLicenses).map(([name, info]) => {
            // Handle our own packages that are marked as UNLICENSED but actually have MIT license
            const displayLicense = info.licenses === 'UNLICENSED' && (name.startsWith('@didhub/')) ? 'MIT' : info.licenses;
            
            return (
              <Box key={name} sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  License: {displayLicense}
                </Typography>
                {info.repository && (
                  <Typography variant="body2" color="text.secondary">
                    Repository: <a href={info.repository} target="_blank" rel="noopener noreferrer">{info.repository}</a>
                  </Typography>
                )}
                {info.publisher && (
                  <Typography variant="body2" color="text.secondary">
                    Publisher: {info.publisher}
                  </Typography>
                )}
              </Box>
            );
          })}
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Backend Dependencies</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {backendLicenses && backendLicenses.map((dep) => (
            <Box key={dep.name} sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle1" fontWeight="bold">
                {dep.name} v{dep.version}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                License: {dep.license}
              </Typography>
              {dep.repository && (
                <Typography variant="body2" color="text.secondary">
                  Repository: <a href={dep.repository} target="_blank" rel="noopener noreferrer">{dep.repository}</a>
                </Typography>
              )}
              {dep.description && (
                <Typography variant="body2" color="text.secondary">
                  {dep.description}
                </Typography>
              )}
            </Box>
          ))}
        </AccordionDetails>
      </Accordion>
    </Container>
  );
}