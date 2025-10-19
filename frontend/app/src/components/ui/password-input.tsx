import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type Props = Omit<React.ComponentProps<typeof Input>, 'type'> & {
  toggleAriaLabel?: string
}

export function PasswordInput({ className, toggleAriaLabel = "Show password", ...props }: Props) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative w-full">
      {/* make space for the toggle button */}
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />

      <div className="absolute inset-y-0 right-0 pr-1 flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={visible}
          aria-label={toggleAriaLabel}
          onClick={() => setVisible((v) => !v)}
          className="h-8 w-8"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

export default PasswordInput
