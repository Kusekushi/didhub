import React from 'react';
import { Container, Box, Button } from '@mui/material';

type ErrorBoundaryState = { error: Error | null; info: any | null };

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null, info: null };
  }
  componentDidCatch(error: Error, info: any) {
    this.setState({ error, info });
  }
  render() {
    if (this.state.error) {
      return (
        <Container>
          <Box sx={{ p: 2 }}>
            <h2>Application error</h2>
            <div style={{ whiteSpace: 'pre-wrap', color: 'red' }}>
              {String(this.state.error && this.state.error.toString())}
            </div>
            <details style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>
              <summary>Stack / component trace</summary>
              <div>
                {this.state.info ? this.state.info.componentStack || JSON.stringify(this.state.info) : 'no info'}
              </div>
            </details>
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </Box>
          </Box>
        </Container>
      );
    }
    return this.props.children as any;
  }
}
