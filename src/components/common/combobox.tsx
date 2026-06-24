import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface ComboOption {
  value: string
  label: string
  group?: string
  sublabel?: string
  keywords?: string[]
}

interface ComboboxProps {
  options: ComboOption[]
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  disabled,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  const grouped = useMemo(() => {
    const map = new Map<string, ComboOption[]>()
    for (const opt of options) {
      const g = opt.group ?? ""
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(opt)
    }
    return Array.from(map.entries())
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-11 w-full justify-between gap-2 font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command
          filter={(value, search, keywords) => {
            const haystack = `${value} ${(keywords ?? []).join(" ")}`.toLowerCase()
            return haystack.includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder={searchPlaceholder} className="h-11" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {grouped.map(([group, opts]) => (
              <CommandGroup key={group || "_"} heading={group || undefined}>
                {opts.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    keywords={[opt.label, ...(opt.keywords ?? [])]}
                    onSelect={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        opt.value === value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1 truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {opt.sublabel}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
