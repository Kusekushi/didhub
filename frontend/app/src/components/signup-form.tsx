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
import { Link } from "react-router-dom"

type Props = {
  username: string
  displayName: string
  password: string
  confirmPassword: string
  onUsernameChange: (v: string) => void
  onDisplayNameChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onConfirmPasswordChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  loading?: boolean
  error?: string | null
  disabled?: boolean
}

export function SignupForm({
  username,
  displayName,
  password,
  confirmPassword,
  onUsernameChange,
  onDisplayNameChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  loading,
  error,
  disabled,
  className,
  ...props
}: Props & React.ComponentProps<'form'>) {
  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={onSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Fill in the form below to create your account
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input id="username" type="text" placeholder="johndoe" required value={username} onChange={(e) => onUsernameChange(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="display_name">Display name</FieldLabel>
          <Input id="display_name" type="text" placeholder="John Doe" required value={displayName} onChange={(e) => onDisplayNameChange(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" type="password" required value={password} onChange={(e) => onPasswordChange(e.target.value)} />
          <FieldDescription>
            Must be at least 8 characters long.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
          <Input id="confirm-password" type="password" required value={confirmPassword} onChange={(e) => onConfirmPasswordChange(e.target.value)} />
          <FieldDescription>Please confirm your password.</FieldDescription>
        </Field>
        {error && (
          <div role="alert" className="text-sm text-red-600">
            {error}
          </div>
        )}

        <Field>
          <Button type="submit" disabled={loading || disabled}>{loading ? 'Creating...' : 'Create Account'}</Button>
        </Field>
        <FieldSeparator />
        <Field>
          <FieldDescription className="px-6 text-center">
            Already have an account? <Link to="/login">Sign in</Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
