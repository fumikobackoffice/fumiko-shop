'use client';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { provinces } from "@/lib/provinces";

interface ProvinceComboboxProps {
    value: string;
    onChange: (value: string) => void;
    disabledProvinces?: string[];
    disabled?: boolean;
    className?: string;
}

export function ProvinceCombobox({ value, onChange, disabledProvinces = [], disabled, className }: ProvinceComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProvinces = provinces.filter((p) =>
    p.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          {value || "เลือกจังหวัด..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="ค้นหาชื่อจังหวัด..." 
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList>
            {filteredProvinces.length === 0 && (
              <CommandEmpty>ไม่พบข้อมูลจังหวัด</CommandEmpty>
            )}
            <CommandGroup>
              {filteredProvinces.map((p) => {
                const isDisabled = disabledProvinces.includes(p) && p !== value;
                return (
                  <CommandItem
                    key={p}
                    value={p}
                    disabled={isDisabled}
                    onSelect={() => {
                      onChange(p);
                      setOpen(false);
                      setSearchTerm("");
                    }}
                    className={cn(isDisabled && "opacity-50 cursor-not-allowed")}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === p ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {p}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
