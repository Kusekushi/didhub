import React, { useState } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeContextProvider from '../ThemeContext';
import AuthLayout from '../components/AuthLayout';

type Msg = { type: 'success' | 'error' | 'info'; text: string } | null;

export default function SignUp(): React.ReactElement {
  const { register } = useAuth() as any;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requestSystem, setRequestSystem] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    try {
      const res = await register(username, password, requestSystem);
      if (res && (res as any).ok) {
        navigate('/login');
        return;
      }
      setMsg({ type: 'error', text: String((res && (res as any).error) || 'Registration failed') });
    } catch (err: any) {
      setMsg({ type: 'error', text: String(err || 'Registration failed') });
    } finally {
      setLoading(false);
    }
  };

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <ThemeContextProvider>
      <CssBaseline enableColorScheme />
      <AuthLayout title="Sign up">
        {msg && (
          <Alert severity={msg.type} sx={{ width: '100%', mb: 2 }}>
            {msg.text}
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Username"
            placeholder="JonSnow"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            margin="normal"
            required
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton aria-label="toggle password visibility" onClick={handleClickShowPassword} edge="end">
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            fullWidth
            label="Confirm Password"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            margin="normal"
            required
            error={confirmPassword !== '' && password !== confirmPassword}
            helperText={confirmPassword !== '' && password !== confirmPassword ? 'Passwords do not match' : ''}
          />
          <FormControlLabel
            control={<Checkbox checked={requestSystem} onChange={(e) => setRequestSystem(e.target.checked)} />}
            label="Request system user account"
            sx={{ mt: 1 }}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 2 }}
            disabled={loading || password !== confirmPassword}
          >
            {loading ? 'Signing up...' : 'Sign up'}
          </Button>
        </form>
      </AuthLayout>
    </ThemeContextProvider>
  );
}
