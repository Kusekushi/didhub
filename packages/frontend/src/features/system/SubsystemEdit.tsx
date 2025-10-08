import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Box, Typography, Button, TextField } from '@mui/material';

import { apiClient } from '@didhub/api-client';

export default function SubsystemEdit() {
  const { sid } = useParams() as any;
  const nav = useNavigate();
  const [values, setValues] = useState<any>(null);
  useEffect(() => {
    (async () => {
      try {
        const s = await apiClient.subsystems.get(sid);
        setValues(s || {});
      } catch (e) {
        setValues({});
      }
    })();
  }, [sid]);
  if (values === null)
    return (
      <Container>
        <Box sx={{ my: 4 }}>Loading...</Box>
      </Container>
    );
  return (
    <Container>
      <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column', my: 2 }}>
        <Typography variant="h5">Edit Subsystem</Typography>
        <TextField
          label="Name"
          value={values.name || ''}
          onChange={(e) => setValues({ ...values, name: (e.target as HTMLInputElement).value })}
        />
        <TextField
          label="Description"
          value={values.description || ''}
          onChange={(e) => setValues({ ...values, description: (e.target as HTMLInputElement).value })}
          multiline
        />
        <TextField
          label="Type"
          value={values.type || ''}
          onChange={(e) => setValues({ ...values, type: (e.target as HTMLInputElement).value })}
        />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={async () => {
              await apiClient.subsystems.update(sid, values);
              nav(-1);
            }}
          >
            Save
          </Button>
          <Button onClick={() => nav(-1)}>Cancel</Button>
        </Box>
      </Box>
    </Container>
  );
}
