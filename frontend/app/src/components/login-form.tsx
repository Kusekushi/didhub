import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import PasswordInput from "@/components/ui/password-input"
import { Link } from 'react-router-dom'

type Props = {
  username: string
  password: string
  onUsernameChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  loading?: boolean
  disabled?: boolean
  error?: string | null
}

export function LoginForm({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  loading,
  disabled,
  className,
  ...props
}: Props & React.ComponentProps<'form'>) {
    return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={onSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Login to your account</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Enter your username below to login to your account
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input id="username" type="text" placeholder="username" required value={username} onChange={(e) => onUsernameChange(e.target.value)} />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link to="/reset-password" className="ml-auto text-sm underline-offset-4 hover:underline">
              Forgot your password?
            </Link>
          </div>
          <PasswordInput id="password" required value={password} onChange={(e) => onPasswordChange(e.target.value)} />
        </Field>
        <Field>
          <Button type="submit" disabled={loading || disabled}>{loading ? 'Logging in...' : 'Login'}</Button>
        </Field>
        <FieldSeparator />
        <Field>
          <FieldDescription className="text-center">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="underline underline-offset-4">
              Sign up
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
    )
}
