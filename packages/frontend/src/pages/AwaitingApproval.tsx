import React from 'react';
import { Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function AwaitingApproval(): React.ReactElement {
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '40px auto' }}>
      <h2>Your account is awaiting approval</h2>
      <p>
        Thanks for registering. Your account requires approval from an administrator before you can fully use this
        instance. You will not be able to interact until an admin approves your account.
      </p>
      <p>If you believe this was a mistake, contact an administrator or try again later.</p>
      <div style={{ marginTop: 16 }}>
        <Button component={RouterLink} to="/" variant="outlined">
          Back to home
        </Button>
      </div>
    </div>
  );
}
