export default function ResetPassword() {
  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-md shadow p-6">
        <h1 className="text-xl font-semibold mb-4">Reset your password</h1>
        <p className="text-sm text-muted-foreground mb-4">This is a stub page. Implement reset flow here (request reset link, OTP, etc.).</p>
        <form className="flex flex-col gap-4">
          <label className="text-sm">Username</label>
          <input type="text" className="input" placeholder="username" />
          <button type="button" className="btn btn-primary">Send reset link</button>
        </form>
      </div>
    </div>
  )
}
