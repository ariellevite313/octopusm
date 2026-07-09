import { useEffect, useState } from "react"
import { Toaster as Sonner, ToasterProps } from "sonner"

function useOctopusTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light"
    return document.documentElement.classList.contains("dark") ? "dark" : "light"
  })

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light")
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return theme
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useOctopusTheme()

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: "font-sans text-sm rounded-2xl border shadow-lg",
          title: "font-semibold",
          description: "text-xs opacity-80",
          closeButton: "rounded-full",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
